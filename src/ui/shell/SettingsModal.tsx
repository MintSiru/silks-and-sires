import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { GameState, SilksDesign } from '../../engine/types';
import { silksDesignOf } from '../../engine/people/silks';
import type { GameApi } from '../game/useGame';
import { useWeightUnit } from '../game/WeightUnitContext';
import { WEIGHT_UNITS, isWeightUnit, weightUnitLabelKo } from '../game/units';
import SilksEditor from '../silks/SilksEditor';
import { SILKS_ERROR_KO } from '../silks/silksText';
import type { ToastTone } from './Toast';
import {
  NEW_GAME_WARNING_KO,
  RACE_PLAN_MODE_OPTIONS,
  autoApproveFromMode,
  autoSellOn,
  autoSendToTrainingOn,
  autoTrainingGuide,
  matingProgressGuide,
  racePlanMode,
} from './settingsView';
import {
  SAVE_SLOT_ROWS,
  deleteConfirmKo,
  overwriteConfirmKo,
  saveSlotCells,
  slotLabelOf,
  slotMetaOf,
} from './saveSlotsView';
import type { ManualSlotId, SaveSlotMeta } from '../storage/saveStore';
import { exportSaveFile, importConfirmKo, type SaveFileFormat, type SaveImportResult } from '../storage/fileTransfer';

/** 저장 칸에서 확인을 기다리는 동작(덮어쓰기는 채워진 칸에 저장할 때, 삭제는 수동 칸) */
interface PendingSlotAction {
  id: ManualSlotId;
  action: 'overwrite' | 'delete';
}

export interface SettingsModalProps {
  game: GameApi;
  state: GameState;
  /** 경제 방식 문구(화면 안내용, 조작 없음) */
  economyText: string;
  onClose: () => void;
  /** 저장·불러오기·승부복 결과를 토스트로 알린다 */
  onNotify: (text: string, tone?: ToastTone) => void;
  /** 불러오기 성공 뒤 화면 상태를 처음으로 되돌리는 일은 App 이 맡는다 */
  onLoaded: () => void;
  /** 새 게임 확인을 통과했을 때 */
  onStartNewGame: () => void;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : '작업을 완료하지 못했습니다.';
}

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

/**
 * 포커스 갇힘: Tab 이 대화상자 끝에서 밖으로 나가지 않고 처음·끝으로 돈다.
 * 브라우저마다 showModal 의 기본 순환이 다르므로 명시적으로 막는다.
 */
function trapTab(event: ReactKeyboardEvent<HTMLDialogElement>): void {
  if (event.key !== 'Tab') return;
  const dialog = event.currentTarget;
  const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
  const first = items[0];
  const last = items[items.length - 1];
  if (first === undefined || last === undefined) return;
  const active = document.activeElement;
  const inside = active instanceof HTMLElement && dialog.contains(active);
  if (event.shiftKey) {
    if (!inside || active === first) {
      event.preventDefault();
      last.focus();
    }
  } else if (!inside || active === last) {
    event.preventDefault();
    first.focus();
  }
}

/**
 * 메뉴·설정 모달(M6-U2 A1). 본문을 밀지 않는 native dialog 다.
 * showModal 이라 배경은 inert 이고 Tab 은 모달 안에서만 돈다(포커스 갇힘). ESC 와 닫기 버튼으로 닫힌다.
 * 그룹: 저장 관리 / 진행·자동화 / 표시·외형 / 위험 영역(새 게임은 확인 단계 뒤).
 */
export default function SettingsModal({
  game,
  state,
  economyText,
  onClose,
  onNotify,
  onLoaded,
  onStartNewGame,
}: SettingsModalProps) {
  const { unit, setUnit } = useWeightUnit();
  const panel = useRef<HTMLDialogElement>(null);
  const [saving, setSaving] = useState(false);
  const [silks, setSilks] = useState<SilksDesign | null>(null);
  const [confirmNewGame, setConfirmNewGame] = useState(false);
  /** 저장 칸 메타. null 이면 아직 읽는 중이다. */
  const [slots, setSlots] = useState<SaveSlotMeta[] | null>(null);
  const [pending, setPending] = useState<PendingSlotAction | null>(null);
  /** 가져오기 검사를 통과한 저장본. 확인을 누르기 전에는 게임을 바꾸지 않는다(M6-S S4). */
  const [imported, setImported] = useState<{ fileName: string; state: GameState } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  /** 새 게임 확인 영역. 열리면 모달 안에서 보이도록 스크롤한다(M6-X X2). */
  const newGameConfirm = useRef<HTMLDivElement>(null);
  const owner = state.owners[state.playerOwnerId];
  const mode = racePlanMode(state.settings);

  useEffect(() => {
    const dialog = panel.current;
    const previous = document.activeElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);

  // 모달이 열릴 때 칸 목록을 한 번 읽는다. 저장·삭제 뒤에는 reloadSlots 로 다시 읽는다.
  useEffect(() => {
    let alive = true;
    game
      .listSaves()
      .then((list) => {
        if (alive) setSlots(list);
      })
      .catch((e: unknown) => {
        if (alive) onNotify(messageOf(e), 'error');
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (confirmNewGame) newGameConfirm.current?.scrollIntoView({ block: 'nearest' });
  }, [confirmNewGame]);

  const reloadSlots = (): Promise<void> => game.listSaves().then(setSlots);

  /** 칸에 지금 게임을 쓴다. 성공하면 칸 목록을 다시 읽고 토스트로 알린다. 모달은 열어 둔다. */
  const performSlotSave = (id: ManualSlotId) => {
    setSaving(true);
    game
      .saveToSlot(id)
      .then(() => {
        setPending(null);
        onNotify(`${slotLabelOf(id)}에 저장했습니다.`);
        return reloadSlots();
      })
      .catch((e: unknown) => onNotify(messageOf(e), 'error'))
      .finally(() => setSaving(false));
  };

  /** 빈 칸이면 바로 저장하고, 채워진 칸이면 덮어쓰기 확인을 먼저 띄운다. */
  const requestSlotSave = (id: ManualSlotId, filled: boolean) => {
    if (filled) setPending({ id, action: 'overwrite' });
    else performSlotSave(id);
  };

  const performSlotDelete = (id: ManualSlotId) => {
    setSaving(true);
    game
      .deleteSlot(id)
      .then(() => {
        setPending(null);
        onNotify(`${slotLabelOf(id)} 저장본을 지웠습니다.`);
        return reloadSlots();
      })
      .catch((e: unknown) => onNotify(messageOf(e), 'error'))
      .finally(() => setSaving(false));
  };

  const confirmPending = () => {
    if (pending === null) return;
    if (pending.action === 'overwrite') performSlotSave(pending.id);
    else performSlotDelete(pending.id);
  };

  /** 칸 저장본으로 게임을 바꾼다. 빈 칸이면 모달을 열어 둔 채 알린다. */
  const runSlotLoad = (id: string) => {
    setSaving(true);
    game
      .loadSlot(id)
      .then((ok) => {
        if (ok) onLoaded();
        else onNotify('불러올 저장본이 없습니다.', 'error');
      })
      .catch((e: unknown) => onNotify(messageOf(e), 'error'))
      .finally(() => setSaving(false));
  };

  /** 현재 게임을 파일로 내려받는다. 게임 상태는 바뀌지 않는다. */
  const runExport = (format: SaveFileFormat) => {
    setSaving(true);
    exportSaveFile(state, format)
      .then((fileName) => onNotify(`${fileName} 파일로 내보냈습니다.`))
      .catch((e: unknown) => onNotify(messageOf(e), 'error'))
      .finally(() => setSaving(false));
  };

  /** 고른 파일을 검사한다. 통과하면 확인을 띄우고, 게임은 확인 뒤에만 바뀐다. */
  const onPickFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file === undefined) return;
    setSaving(true);
    game
      .importSaveFile(file)
      .then((result: SaveImportResult) => {
        if (result.ok) setImported({ fileName: file.name, state: result.state });
        else onNotify(result.message, 'error');
      })
      .catch((e: unknown) => onNotify(messageOf(e), 'error'))
      .finally(() => setSaving(false));
  };

  const confirmImport = () => {
    if (imported === null) return;
    game.applyImportedGame(imported.state);
    setImported(null);
    onLoaded();
  };

  const applySilks = (design: SilksDesign) => {
    setSaving(true);
    game
      .setSilks(design)
      .then((r) => {
        if (r.ok) {
          setSilks(null);
          onNotify('승부복을 적용했습니다.');
        } else onNotify(SILKS_ERROR_KO[r.error], 'error');
      })
      .catch((e: unknown) => onNotify(messageOf(e), 'error'))
      .finally(() => setSaving(false));
  };

  return (
    <dialog
      ref={panel}
      className="shell-modal"
      aria-labelledby="shell-modal-title"
      onKeyDown={trapTab}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="shell-modal__head">
        <h2 id="shell-modal-title">메뉴·설정</h2>
        <button type="button" className="btn" onClick={onClose}>
          닫기
        </button>
      </div>

      <section className="shell-section" aria-labelledby="shell-group-save">
        <h3 id="shell-group-save">저장 관리</h3>
        <div className="save-slots-scroll">
          <table className="save-slots" aria-label="저장 칸">
            <thead>
              <tr>
                <th scope="col">칸</th>
                <th scope="col">게임 날짜</th>
                <th scope="col">마주</th>
                <th scope="col">저장 시각</th>
                <th scope="col">크기</th>
                <th scope="col">조작</th>
              </tr>
            </thead>
            <tbody>
              {SAVE_SLOT_ROWS.map((row) => {
                const cells = saveSlotCells(slotMetaOf(slots, row.id), slots === null);
                const ready = slots !== null && !saving;
                return (
                  <tr key={row.id}>
                    <th scope="row">{row.label}</th>
                    <td>{cells.dateText}</td>
                    <td>{cells.playerText}</td>
                    <td>{cells.savedAtText}</td>
                    <td>{cells.sizeText}</td>
                    <td>
                      <div className="save-slots__actions">
                        {row.kind === 'manual' && (
                          <button
                            type="button"
                            className="btn"
                            disabled={!ready}
                            aria-label={`${row.label} 저장`}
                            onClick={() => requestSlotSave(row.id, cells.filled)}
                          >
                            저장
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn"
                          disabled={!ready || !cells.filled}
                          aria-label={`${row.label} 불러오기`}
                          onClick={() => runSlotLoad(row.id)}
                        >
                          불러오기
                        </button>
                        {row.kind === 'manual' && (
                          <button
                            type="button"
                            className="btn"
                            disabled={!ready || !cells.filled}
                            aria-label={`${row.label} 삭제`}
                            onClick={() => setPending({ id: row.id, action: 'delete' })}
                          >
                            삭제
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {pending !== null && (
          <div role="group" aria-label="저장 칸 확인" className="save-slots__confirm">
            <p className="hint">
              {pending.action === 'overwrite'
                ? overwriteConfirmKo(slotLabelOf(pending.id))
                : deleteConfirmKo(slotLabelOf(pending.id))}
            </p>
            <div className="shell-row">
              <button type="button" className="btn" disabled={saving} onClick={() => setPending(null)}>
                취소
              </button>
              <button
                type="button"
                className={pending.action === 'delete' ? 'btn shell-danger__button' : 'btn btn--primary'}
                disabled={saving}
                onClick={confirmPending}
              >
                {pending.action === 'overwrite' ? '덮어쓰기' : '삭제'}
              </button>
            </div>
          </div>
        )}
        <div className="shell-row">
          <button type="button" className="btn" disabled={saving} onClick={() => runExport('ssg')}>
            파일로 내보내기 (.ssg)
          </button>
          <button type="button" className="btn" disabled={saving} onClick={() => runExport('json')}>
            파일로 내보내기 (.json)
          </button>
          <button type="button" className="btn" disabled={saving} onClick={() => fileInput.current?.click()}>
            파일에서 가져오기
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".ssg,.json,application/json"
            hidden
            aria-label="가져올 저장 파일"
            onChange={onPickFile}
          />
        </div>
        {imported !== null && (
          <div role="group" aria-label="가져오기 확인" className="save-slots__confirm">
            <p className="hint">{importConfirmKo(imported.fileName)}</p>
            <div className="shell-row">
              <button type="button" className="btn" disabled={saving} onClick={() => setImported(null)}>
                취소
              </button>
              <button type="button" className="btn btn--primary" disabled={saving} onClick={confirmImport}>
                가져오기
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="shell-section" aria-labelledby="shell-group-progress">
        <h3 id="shell-group-progress">진행·자동화</h3>
        <div className="shell-items">
          <fieldset className="shell-fieldset">
            <legend>출주 계획</legend>
            {RACE_PLAN_MODE_OPTIONS.map((option) => (
              <label key={option.mode} className="shell-choice">
                <input
                  type="radio"
                  name="race-plan-mode"
                  value={option.mode}
                  checked={mode === option.mode}
                  onChange={() => game.setAutoApproveRacePlans(autoApproveFromMode(option.mode))}
                />
                <span className="shell-choice__text">
                  <span>{option.label}</span>
                  <span className="hint">{option.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <div className="shell-checks">
            <label className="shell-check">
              <input
                type="checkbox"
                checked={autoSendToTrainingOn(state.settings)}
                onChange={(e) => game.setAutoSendToTraining(e.target.checked)}
              />
              <span>2세 자동 조교 보내기</span>
            </label>
            <label className="shell-check">
              <input
                type="checkbox"
                checked={autoSellOn(state.settings)}
                onChange={(e) => game.setAutoSell(e.target.checked)}
              />
              <span>판매 제안 자동 위탁</span>
            </label>
          </div>
          <p className="hint">{autoTrainingGuide()}</p>
          <div className="shell-item">
            <h4 className="shell-item__title">
              교배 예약
            </h4>
            <p className="hint">{matingProgressGuide(state.settings)}</p>
          </div>
          <p className="hint shell-economy">경제 방식: {economyText}</p>
        </div>
      </section>

      <section className="shell-section" aria-labelledby="shell-group-display">
        <h3 id="shell-group-display">표시·외형</h3>
        <label className="shell-field">
          <span>부담중량 단위</span>
          <select
            value={unit}
            onChange={(e) => {
              if (isWeightUnit(e.target.value)) setUnit(e.target.value);
            }}
          >
            {WEIGHT_UNITS.map((u) => (
              <option key={u} value={u}>
                {weightUnitLabelKo(u)}
              </option>
            ))}
          </select>
        </label>
        {silks === null ? (
          <div className="shell-row">
            <button
              type="button"
              className="btn"
              disabled={!owner || saving}
              onClick={() => owner && setSilks(silksDesignOf(owner.silks, owner.id))}
            >
              승부복 바꾸기
            </button>
          </div>
        ) : (
          <div className="shell-silks">
            <SilksEditor design={silks} onChange={setSilks} />
            <div className="shell-row">
              <button type="button" className="btn btn--primary" disabled={saving} onClick={() => applySilks(silks)}>
                승부복 적용
              </button>
              <button type="button" className="btn" disabled={saving} onClick={() => setSilks(null)}>
                취소
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="shell-section shell-danger" aria-labelledby="shell-group-danger">
        <h3 id="shell-group-danger">위험 영역</h3>
        {!confirmNewGame ? (
          <button type="button" className="btn shell-danger__button" onClick={() => setConfirmNewGame(true)}>
            새 게임
          </button>
        ) : (
          <div role="group" aria-label="새 게임 확인" className="shell-danger__confirm" ref={newGameConfirm}>
            <p className="hint">{NEW_GAME_WARNING_KO}</p>
            <div className="shell-row">
              <button type="button" className="btn" onClick={() => setConfirmNewGame(false)}>
                취소
              </button>
              <button type="button" className="btn shell-danger__button" onClick={onStartNewGame}>
                새 게임으로 이동
              </button>
            </div>
          </div>
        )}
      </section>
    </dialog>
  );
}
