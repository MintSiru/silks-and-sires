import { useState, type FormEvent, type JSX } from 'react';
import { DEFAULT_ECONOMY_MODE, LEGACY_BANKRUPT_WEEKS } from '../../engine/config/economy';
import { DEFAULT_GAME_SETTINGS, HOME_COUNTRIES } from '../../engine/config/farm';
import { silksDesignOf, silksFromDesign } from '../../engine/people/silks';
import type { Difficulty, EconomyMode, HomeCountry, StartType } from '../../engine/types';
import { countryKo } from '../game/text';
import { PLAYER_SILKS, type GameApi } from '../game/useGame';
import SilksEditor from '../silks/SilksEditor';
import {
  CATASTROPHIC_INJURY_HINT_KO,
  DIFFICULTY_OPTIONS,
  GRANT_RACEHORSES_HINT_KO,
  HOME_COUNTRY_HINT_KO,
  START_TYPE_OPTIONS,
  startSummaryKo,
} from './newGameView';
/** 새 게임 시작 폼 기본 시드(데모와 같은 값) */
const DEFAULT_SEED_TEXT = '20261011';
/** 새 게임 경제 모드 선택지(짧은 설명 포함). 파산 주 수는 config 값을 그대로 쓴다. */
const ECONOMY_MODE_OPTIONS: readonly { mode: EconomyMode; label: string; description: string }[] = [
  {
    mode: 'casual',
    label: '캐주얼',
    description:
      '파산이 없습니다. 적자는 빚으로 쌓이고 매주 이자가 붙습니다. 빚이 있으면 교배 예약 같은 임의 지출이 막힙니다.',
  },
  {
    mode: 'legacy',
    label: '레거시',
    description: `자금이 마이너스인 상태가 ${LEGACY_BANKRUPT_WEEKS}주 연속이면 파산하고 게임이 멈춥니다.`,
  },
];

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : '게임을 시작하지 못했습니다.';
}
interface NewGameScreenProps {
  game: GameApi;
  onDone: () => void;
  onCancel?: () => void;
  canLoad?: boolean;
}

export default function NewGameScreen({
  game,
  onDone,
  onCancel,
  canLoad = true,
}: NewGameScreenProps): JSX.Element {
  const [silks, setSilks] = useState(() => silksDesignOf(PLAYER_SILKS, 'owner-player'));
  const [playerName, setPlayerName] = useState('');
  const [farmName, setFarmName] = useState('');
  const [seedText, setSeedText] = useState(DEFAULT_SEED_TEXT);
  const [economyMode, setEconomyMode] = useState<EconomyMode>(DEFAULT_ECONOMY_MODE);
  const [startType, setStartType] = useState<StartType>(DEFAULT_GAME_SETTINGS.startType);
  const [difficulty, setDifficulty] = useState<Difficulty>(DEFAULT_GAME_SETTINGS.difficulty);
  const [homeCountry, setHomeCountry] = useState<HomeCountry>('GB');
  const [grantRacehorses, setGrantRacehorses] = useState(true);
  const [catastrophicInjuries, setCatastrophicInjuries] = useState(
    DEFAULT_GAME_SETTINGS.catastrophicInjuries,
  );
  const [error, setError] = useState<string | null>(null);
  const summary = startSummaryKo(startType, difficulty, grantRacehorses);

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const name = playerName.trim();
    if (name === '') {
      setError('마주 이름을 입력하세요.');
      return;
    }
    const seedRaw = seedText.trim();
    const seed = seedRaw === '' ? Number.NaN : Number(seedRaw);
    if (!Number.isSafeInteger(seed) || seed < 0) {
      setError('시드는 0 이상의 정수로 입력하세요.');
      return;
    }
    try {
      game.newGame({
        seed,
        playerName: name,
        farmName: startType === 'owner_breeder' ? farmName : undefined,
        silks: silksFromDesign(silks),
        economyMode,
        startType,
        difficulty,
        homeCountry,
        catastrophicInjuries,
        grantRacehorses,
      });
      onDone();
    } catch (err) {
      setError(messageOf(err));
    }
  };

  const handleLoadSaved = async (): Promise<void> => {
    try {
      if (await game.load()) {
        onDone();
      } else {
        setError('불러올 저장본이 없거나 읽을 수 없습니다.');
      }
    } catch (err) {
      setError(messageOf(err));
    }
  };

  return (
    <section className="panel new-game">
      <h2>새 게임 시작</h2>
      <form className="new-game__form" onSubmit={handleSubmit}>
        <div className="new-game__settings">
          <label className="field">
            <span>마주 이름</span>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="예: 애시콤 스터드 마주"
            />
          </label>
          <label className="field">
            <span>시드(같은 시드는 같은 세계)</span>
            <input
              type="text"
              inputMode="numeric"
              value={seedText}
              onChange={(e) => setSeedText(e.target.value)}
            />
          </label>
          <fieldset className="field">
            <legend>경제 모드</legend>
            {ECONOMY_MODE_OPTIONS.map((option) => (
              <label key={option.mode} className="choice-field" title={option.description}>
                <input
                  type="radio"
                  name="economy-mode"
                  value={option.mode}
                  checked={economyMode === option.mode}
                  onChange={() => setEconomyMode(option.mode)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </fieldset>
          <fieldset className="field">
            <legend>시작 유형</legend>
            {START_TYPE_OPTIONS.map((option) => (
              <label key={option.value} className="choice-field" title={option.description}>
                <input
                  type="radio"
                  name="start-type"
                  value={option.value}
                  checked={startType === option.value}
                  onChange={() => setStartType(option.value)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </fieldset>
          {startType === 'owner_breeder' && (
            <label className="field">
              <span>목장 이름</span>
              <input type="text" value={farmName} onChange={(e) => setFarmName(e.target.value)} />
              <span className="hint">
                빈칸이면 자동으로 정합니다. 2~30자, 글자·공백·하이픈·아포스트로피·마침표를 쓸 수
                있습니다.
              </span>
            </label>
          )}
          <fieldset className="field">
            <legend>난이도</legend>
            {DIFFICULTY_OPTIONS.map((option) => (
              <label key={option.value} className="choice-field" title={option.description}>
                <input
                  type="radio"
                  name="difficulty"
                  value={option.value}
                  checked={difficulty === option.value}
                  onChange={() => setDifficulty(option.value)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </fieldset>
          <label className="field">
            <span>소재국</span>
            <select
              value={homeCountry}
              onChange={(e) => setHomeCountry(e.target.value as HomeCountry)}
            >
              {HOME_COUNTRIES.map((country) => (
                <option key={country} value={country}>
                  {countryKo(country)}
                </option>
              ))}
            </select>
          </label>
          {startType === 'owner_breeder' && (
            <label className="choice-field">
              <input
                type="checkbox"
                checked={grantRacehorses}
                onChange={(e) => setGrantRacehorses(e.target.checked)}
              />
              <span>현역마 지급</span>
            </label>
          )}
          <label className="choice-field">
            <input
              type="checkbox"
              checked={catastrophicInjuries}
              onChange={(e) => setCatastrophicInjuries(e.target.checked)}
            />
            <span>예후불량(경주 중 치명적 부상)</span>
          </label>
          <section className="field" aria-label="고른 시작 조건">
            <span>고른 시작 조건</span>
            <ul className="hint">
              {summary.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
          <details className="new-game__help">
            <summary>시작 설정 도움말</summary>
            {[...ECONOMY_MODE_OPTIONS, ...START_TYPE_OPTIONS, ...DIFFICULTY_OPTIONS].map(
              (option) => (
                <p className="hint" key={option.label}>
                  {option.label}: {option.description}
                </p>
              ),
            )}
            <p className="hint">{HOME_COUNTRY_HINT_KO}</p>
            <p className="hint">현역마 지급: {GRANT_RACEHORSES_HINT_KO}</p>
            <p className="hint">예후불량: {CATASTROPHIC_INJURY_HINT_KO}</p>
          </details>
        </div>
        <SilksEditor design={silks} onChange={setSilks} />
        {error !== null && (
          <p className="notice notice--error" role="alert">
            {error}
          </p>
        )}
        <div className="new-game__actions">
          <button type="submit" className="btn btn--primary">
            새 게임 시작
          </button>
          {canLoad && (
            <button type="button" className="btn" onClick={() => void handleLoadSaved()}>
              저장본 불러오기
            </button>
          )}
          {onCancel !== undefined && (
            <button type="button" className="btn" onClick={onCancel}>
              취소
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
