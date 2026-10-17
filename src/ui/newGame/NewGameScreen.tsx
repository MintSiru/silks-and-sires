import { useId, useState, type FormEvent, type JSX } from 'react';
import { HOME_COUNTRIES } from '../../engine/config/farm';
import { silksDesignOf, silksFromDesign } from '../../engine/people/silks';
import type { Difficulty, EconomyMode, HomeCountry, StartType } from '../../engine/types';
import { countryKo } from '../game/text';
import { PLAYER_SILKS, type GameApi } from '../game/useGame';
import SilksEditor from '../silks/SilksEditor';
import SilksSvg from '../silks/SilksSvg';
import {
  type ChoiceOption,
  CATASTROPHIC_INJURY_HINT_KO,
  DIFFICULTY_OPTIONS,
  ECONOMY_MODE_OPTIONS,
  FARM_NAME_HINT_KO,
  GRANT_RACEHORSES_HINT_KO,
  HOME_COUNTRY_HINT_KO,
  RECOMMENDED_START,
  START_TYPE_OPTIONS,
  isRecommendedStart,
  recommendedStartKo,
  startSummaryKo,
} from './newGameView';
import './newGame.css';

/** 새 게임 시작 폼 기본 시드(데모와 같은 값) */
const DEFAULT_SEED_TEXT = '20261011';

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : '게임을 시작하지 못했습니다.';
}

interface ChoiceGroupProps<T extends string> {
  legend: string;
  name: string;
  options: readonly ChoiceOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

/** 결과 한 줄이 붙은 선택 카드 묶음. 라디오의 이름은 옵션 이름, 설명은 aria-describedby 로 잇는다. */
function ChoiceGroup<T extends string>({ legend, name, options, value, onChange }: ChoiceGroupProps<T>): JSX.Element {
  const prefix = useId();
  return (
    <fieldset className="start-group">
      <legend>{legend}</legend>
      <div className="start-options">
        {options.map((option) => {
          const selected = option.value === value;
          const lineId = `${prefix}-${option.value}`;
          return (
            <label key={option.value} className={selected ? 'start-option is-selected' : 'start-option'}>
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={selected}
                aria-label={option.label}
                aria-describedby={lineId}
                onChange={() => onChange(option.value)}
              />
              <span className="start-option__text">
                <strong>{option.label}</strong>
                <span id={lineId} className="start-option__line">
                  {option.line}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
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
  const id = useId();
  const [silks, setSilks] = useState(() => silksDesignOf(PLAYER_SILKS, 'owner-player'));
  const [playerName, setPlayerName] = useState('');
  const [farmName, setFarmName] = useState('');
  const [seedText, setSeedText] = useState(DEFAULT_SEED_TEXT);
  const [economyMode, setEconomyMode] = useState<EconomyMode>(RECOMMENDED_START.economyMode);
  const [startType, setStartType] = useState<StartType>(RECOMMENDED_START.startType);
  const [difficulty, setDifficulty] = useState<Difficulty>(RECOMMENDED_START.difficulty);
  const [homeCountry, setHomeCountry] = useState<HomeCountry>(RECOMMENDED_START.homeCountry);
  const [grantRacehorses, setGrantRacehorses] = useState(RECOMMENDED_START.grantRacehorses);
  const [catastrophicInjuries, setCatastrophicInjuries] = useState(RECOMMENDED_START.catastrophicInjuries);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [designOpen, setDesignOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const summary = startSummaryKo(startType, difficulty, grantRacehorses);
  const recommended = isRecommendedStart({
    startType,
    difficulty,
    homeCountry,
    economyMode,
    grantRacehorses,
    catastrophicInjuries,
  });

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
      setAdvancedOpen(true);
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

  const ownerBreeder = startType === 'owner_breeder';
  const advancedId = `${id}-advanced`;
  const silksId = `${id}-silks`;
  const farmNameId = `${id}-farm-name`;
  const playerNameId = `${id}-player-name`;
  const homeCountryId = `${id}-home-country`;
  const seedId = `${id}-seed`;
  const grantHintId = `${id}-grant-hint`;
  const injuryHintId = `${id}-injury-hint`;

  return (
    <section className="panel new-game start-card">
      <h2>새 게임 시작</h2>
      <form className="start-card__form" onSubmit={handleSubmit}>
        <div className="start-card__body">
          <div className="start-card__main">
            <div className="start-card__row">
              <div className="start-field">
                <label htmlFor={playerNameId}>마주 이름</label>
                <input
                  id={playerNameId}
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="예: 애시콤 스터드 마주"
                />
              </div>
              {ownerBreeder && (
                <div className="start-field">
                  <label htmlFor={farmNameId}>목장 이름</label>
                  <input
                    id={farmNameId}
                    type="text"
                    value={farmName}
                    onChange={(e) => setFarmName(e.target.value)}
                  />
                  <p className="start-hint">{FARM_NAME_HINT_KO}</p>
                </div>
              )}
              <div className="start-field">
                <label htmlFor={homeCountryId}>소재국</label>
                <select
                  id={homeCountryId}
                  value={homeCountry}
                  onChange={(e) => setHomeCountry(e.target.value as HomeCountry)}
                >
                  {HOME_COUNTRIES.map((country) => (
                    <option key={country} value={country}>
                      {countryKo(country)}
                    </option>
                  ))}
                </select>
                <p className="start-hint">{HOME_COUNTRY_HINT_KO}</p>
              </div>
            </div>

            <p className="start-recommend">
              <strong>추천 조건으로 시작</strong>
              <span>
                {recommended
                  ? `${recommendedStartKo()}. 바꾸지 않아도 바로 시작할 수 있습니다.`
                  : `지금 고른 조건은 추천 조건(${recommendedStartKo()})과 다릅니다.`}
              </span>
            </p>

            <ChoiceGroup
              legend="시작 유형"
              name="start-type"
              options={START_TYPE_OPTIONS}
              value={startType}
              onChange={setStartType}
            />
            <ChoiceGroup
              legend="난이도"
              name="difficulty"
              options={DIFFICULTY_OPTIONS}
              value={difficulty}
              onChange={setDifficulty}
            />

            <button
              type="button"
              className="start-advanced-toggle"
              aria-expanded={advancedOpen}
              aria-controls={advancedId}
              onClick={() => setAdvancedOpen((open) => !open)}
            >
              <span aria-hidden="true">{advancedOpen ? '▾' : '▸'}</span> 고급 설정
            </button>

            {advancedOpen && (
              <div id={advancedId} className="start-advanced">
                <div className="start-field">
                  <label htmlFor={seedId}>시드</label>
                  <input
                    id={seedId}
                    type="text"
                    inputMode="numeric"
                    value={seedText}
                    onChange={(e) => setSeedText(e.target.value)}
                  />
                  <p className="start-hint">같은 시드는 같은 세계를 만듭니다.</p>
                </div>
                <ChoiceGroup
                  legend="경제 모드"
                  name="economy-mode"
                  options={ECONOMY_MODE_OPTIONS}
                  value={economyMode}
                  onChange={setEconomyMode}
                />
                {ownerBreeder && (
                  <div className="start-check">
                    <label>
                      <input
                        type="checkbox"
                        checked={grantRacehorses}
                        aria-describedby={grantHintId}
                        onChange={(e) => setGrantRacehorses(e.target.checked)}
                      />
                      <span>현역마 지급</span>
                    </label>
                    <p id={grantHintId} className="start-hint">
                      {GRANT_RACEHORSES_HINT_KO}
                    </p>
                  </div>
                )}
                <div className="start-check">
                  <label>
                    <input
                      type="checkbox"
                      checked={catastrophicInjuries}
                      aria-describedby={injuryHintId}
                      onChange={(e) => setCatastrophicInjuries(e.target.checked)}
                    />
                    <span>예후불량(경주 중 치명적 부상)</span>
                  </label>
                  <p id={injuryHintId} className="start-hint">
                    {CATASTROPHIC_INJURY_HINT_KO}
                  </p>
                </div>
              </div>
            )}
          </div>

          <aside className="start-card__side">
            <div className="start-silks">
              {/* 편집기를 펼치면 편집기가 그리기를 맡으므로 작은 미리보기와 제목은 숨긴다. */}
              {!designOpen && <SilksSvg design={silks} size={104} />}
              <div>
                {!designOpen && <p className="start-silks__title">승부복</p>}
                <button
                  type="button"
                  className="btn"
                  aria-expanded={designOpen}
                  aria-controls={silksId}
                  onClick={() => setDesignOpen((open) => !open)}
                >
                  꾸미기
                </button>
              </div>
            </div>
            {designOpen && (
              <div id={silksId} className="start-silks-editor">
                <SilksEditor design={silks} onChange={setSilks} />
              </div>
            )}
            <section className="start-summary" aria-label="고른 시작 조건">
              <p className="start-summary__title">고른 시작 조건</p>
              <ul>
                {summary.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </section>
          </aside>
        </div>

        {error !== null && (
          <p className="notice notice--error start-card__error" role="alert">
            {error}
          </p>
        )}
        <div className="start-card__footer">
          <button type="submit" className="btn btn--primary start-card__start">
            이 조건으로 시작
          </button>
          {(canLoad || onCancel !== undefined) && (
            <div className="start-card__sub">
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
          )}
        </div>
      </form>
    </section>
  );
}
