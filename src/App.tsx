import {
  Suspense,
  lazy,
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  FIXED_ROADS,
  GRID_SIZE,
  RESERVED_CELL_COUNT,
  isReservedCell,
  type BuildType,
  type BuildingPlacement,
} from "./components/cityBuilderConfig";
import "./App.css";

type Palette = "urban" | "fantasy";
type ViewMode = "survey" | "build";
type InteractionMode = "build" | "erase";
type SaveSlotId = "A" | "B" | "C";
type HoveredCell = { x: number; z: number };

type BuildingSpec = {
  label: string;
  description: string;
  cost: number;
  income: number;
  maintenance: number;
  energy: number;
  population: number;
  appeal: number;
  palette: Palette;
  requiresRoadAccess: boolean;
};

type TurnLogEntry = {
  turn: number;
  title: string;
  summary: string;
  kind: "good" | "warning" | "neutral";
  fundsDelta: number;
  prestigeDelta: number;
  stabilityDelta: number;
};

type CitySnapshot = {
  placements: BuildingPlacement[];
  funds: number;
  turn: number;
  cityName: string;
  prestige: number;
  stability: number;
  turnLog: TurnLogEntry[];
};

type SaveSlot = {
  id: SaveSlotId;
  name: string;
  savedAt: string;
  snapshot: CitySnapshot;
};

type UiPrefs = {
  activePalette: Palette;
  viewMode: ViewMode;
  interactionMode: InteractionMode;
  showDecorations: boolean;
  showGrid: boolean;
  affordableOnly: boolean;
  toolSearch: string;
};

type Objective = {
  label: string;
  current: number;
  target: number;
  complete: boolean;
};

const STORAGE_KEY = "cidade-builder-state-v5";
const PREFS_KEY = "cidade-builder-prefs-v3";
const SLOTS_KEY = "cidade-builder-slots-v2";
const STARTING_FUNDS = 1400;
const STARTING_PRESTIGE = 34;
const STARTING_STABILITY = 68;
const BASE_TURN_INCOME = 18;
const REFUND_RATE = 0.65;

const CityBuilderScene = lazy(() =>
  import("./components/CityBuilderScene").then((module) => ({
    default: module.CityBuilderScene,
  })),
);

const BUILDING_CATALOG: Record<BuildType, BuildingSpec> = {
  house: {
    label: "Casa",
    description: "Expande bairros e aumenta a populacao trabalhadora.",
    cost: 80,
    income: 12,
    maintenance: 4,
    energy: -2,
    population: 6,
    appeal: 4,
    palette: "urban",
    requiresRoadAccess: true,
  },
  road: {
    label: "Estrada",
    description: "Liga setores e melhora o fluxo entre os lotes.",
    cost: 25,
    income: 0,
    maintenance: 1,
    energy: 0,
    population: 0,
    appeal: 1,
    palette: "urban",
    requiresRoadAccess: false,
  },
  factory: {
    label: "Fabrica",
    description: "Produz recursos e puxa a economia da cidade moderna.",
    cost: 160,
    income: 36,
    maintenance: 8,
    energy: -8,
    population: 0,
    appeal: -3,
    palette: "urban",
    requiresRoadAccess: true,
  },
  townCenter: {
    label: "Town Center",
    description: "Centro principal do assentamento fantasy RTS.",
    cost: 220,
    income: 24,
    maintenance: 7,
    energy: -3,
    population: 12,
    appeal: 8,
    palette: "fantasy",
    requiresRoadAccess: true,
  },
  market: {
    label: "Mercado",
    description: "Cria comercio local e aumenta a circulacao de ouro.",
    cost: 150,
    income: 22,
    maintenance: 3,
    energy: -1,
    population: 2,
    appeal: 6,
    palette: "fantasy",
    requiresRoadAccess: true,
  },
  barracks: {
    label: "Quartel",
    description: "Estrutura militar para o lado RTS da cidade.",
    cost: 180,
    income: 8,
    maintenance: 5,
    energy: -4,
    population: 3,
    appeal: 2,
    palette: "fantasy",
    requiresRoadAccess: true,
  },
  watchTower: {
    label: "Torre",
    description: "Ponto de vigia que marca fronteiras e acesso.",
    cost: 130,
    income: 4,
    maintenance: 2,
    energy: -2,
    population: 1,
    appeal: 2,
    palette: "fantasy",
    requiresRoadAccess: false,
  },
  windmill: {
    label: "Moinho",
    description: "Destaque rural que ajuda a sustentar o distrito.",
    cost: 140,
    income: 10,
    maintenance: 2,
    energy: 4,
    population: 2,
    appeal: 7,
    palette: "fantasy",
    requiresRoadAccess: false,
  },
  temple: {
    label: "Templo",
    description: "Edificio simbolico para a camada fantasy do mapa.",
    cost: 170,
    income: 7,
    maintenance: 4,
    energy: -1,
    population: 4,
    appeal: 9,
    palette: "fantasy",
    requiresRoadAccess: true,
  },
  farm: {
    label: "Fazenda",
    description: "Area produtiva para abrir o mapa e variar os distritos.",
    cost: 90,
    income: 8,
    maintenance: 2,
    energy: 1,
    population: 2,
    appeal: 5,
    palette: "fantasy",
    requiresRoadAccess: false,
  },
};

const TOOL_ORDER: BuildType[] = [
  "house",
  "road",
  "factory",
  "townCenter",
  "market",
  "barracks",
  "watchTower",
  "windmill",
  "temple",
  "farm",
];

const PALETTE_LABELS: Record<Palette, string> = {
  urban: "Urbano",
  fantasy: "Fantasy RTS",
};

const TEMPLATE_PRESETS: Array<{
  id: string;
  label: string;
  description: string;
  placements: BuildingPlacement[];
}> = [
  {
    id: "balanced",
    label: "Distrito misto",
    description: "Casas, mercado e producao leve para comecar rapido.",
    placements: [
      { x: 10, z: 2, type: "house" },
      { x: 11, z: 2, type: "house" },
      { x: 12, z: 2, type: "market" },
      { x: 10, z: 3, type: "road" },
      { x: 11, z: 3, type: "road" },
      { x: 12, z: 3, type: "road" },
      { x: 10, z: 4, type: "farm" },
      { x: 12, z: 4, type: "windmill" },
    ],
  },
  {
    id: "citadel",
    label: "Citadela",
    description: "Nucleo fantasy com defesa, fe e marcos maiores.",
    placements: [
      { x: 9, z: 12, type: "watchTower" },
      { x: 10, z: 12, type: "townCenter" },
      { x: 11, z: 12, type: "temple" },
      { x: 9, z: 13, type: "barracks" },
      { x: 11, z: 13, type: "market" },
      { x: 10, z: 14, type: "road" },
      { x: 11, z: 14, type: "farm" },
    ],
  },
  {
    id: "industrial",
    label: "Parque fabril",
    description: "Expansao moderna com estradas e renda mais forte.",
    placements: [
      { x: 13, z: 0, type: "road" },
      { x: 14, z: 0, type: "factory" },
      { x: 15, z: 0, type: "factory" },
      { x: 16, z: 0, type: "road" },
      { x: 13, z: 1, type: "house" },
      { x: 14, z: 1, type: "road" },
      { x: 15, z: 1, type: "house" },
      { x: 16, z: 1, type: "road" },
    ],
  },
  {
    id: "agro",
    label: "Vale rural",
    description: "Fazendas, moinho e crescimento calmo para testar layout.",
    placements: [
      { x: 9, z: 15, type: "farm" },
      { x: 10, z: 15, type: "farm" },
      { x: 11, z: 15, type: "windmill" },
      { x: 12, z: 15, type: "house" },
      { x: 9, z: 16, type: "road" },
      { x: 10, z: 16, type: "house" },
      { x: 11, z: 16, type: "road" },
      { x: 12, z: 16, type: "market" },
    ],
  },
];

const DEFAULT_PREFS: UiPrefs = {
  activePalette: "urban",
  viewMode: "survey",
  interactionMode: "build",
  showDecorations: true,
  showGrid: true,
  affordableOnly: false,
  toolSearch: "",
};

const DEFAULT_CITY_STATE: CitySnapshot = {
  placements: [],
  funds: STARTING_FUNDS,
  turn: 1,
  cityName: "Nova Aurora",
  prestige: STARTING_PRESTIGE,
  stability: STARTING_STABILITY,
  turnLog: [],
};

const FIXED_ROAD_KEYS = new Set(FIXED_ROADS.map((road) => `${road.x}:${road.z}`));

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getPlacementKey(x: number, z: number) {
  return `${x}:${z}`;
}

function sanitizePlacements(input: unknown): BuildingPlacement[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input.filter((placement): placement is BuildingPlacement => {
    if (!placement || typeof placement !== "object") {
      return false;
    }

    const candidate = placement as Partial<BuildingPlacement>;
    return (
      typeof candidate.x === "number" &&
      typeof candidate.z === "number" &&
      TOOL_ORDER.includes(candidate.type as BuildType) &&
      candidate.x >= 0 &&
      candidate.x < GRID_SIZE &&
      candidate.z >= 0 &&
      candidate.z < GRID_SIZE &&
      !isReservedCell(candidate.x, candidate.z)
    );
  });
}

function sanitizeTurnLog(input: unknown): TurnLogEntry[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .filter((entry): entry is TurnLogEntry => {
      if (!entry || typeof entry !== "object") {
        return false;
      }

      const candidate = entry as Partial<TurnLogEntry>;
      return (
        typeof candidate.turn === "number" &&
        typeof candidate.title === "string" &&
        typeof candidate.summary === "string" &&
        typeof candidate.fundsDelta === "number" &&
        typeof candidate.prestigeDelta === "number" &&
        typeof candidate.stabilityDelta === "number" &&
        (candidate.kind === "good" ||
          candidate.kind === "warning" ||
          candidate.kind === "neutral")
      );
    })
    .slice(0, 8);
}

function clonePlacements(placements: BuildingPlacement[]) {
  return placements.map((placement) => ({ ...placement }));
}

function cloneTurnLog(turnLog: TurnLogEntry[]) {
  return turnLog.map((entry) => ({ ...entry }));
}

function cloneSnapshot(snapshot: CitySnapshot): CitySnapshot {
  return {
    ...snapshot,
    placements: clonePlacements(snapshot.placements),
    turnLog: cloneTurnLog(snapshot.turnLog),
  };
}

function hasRoadAccess(x: number, z: number, placements: BuildingPlacement[]) {
  const roadKeys = new Set(FIXED_ROAD_KEYS);

  placements.forEach((placement) => {
    if (placement.type === "road") {
      roadKeys.add(getPlacementKey(placement.x, placement.z));
    }
  });

  return (
    roadKeys.has(getPlacementKey(x + 1, z)) ||
    roadKeys.has(getPlacementKey(x - 1, z)) ||
    roadKeys.has(getPlacementKey(x, z + 1)) ||
    roadKeys.has(getPlacementKey(x, z - 1))
  );
}

function loadCityState(): CitySnapshot {
  if (typeof window === "undefined") {
    return DEFAULT_CITY_STATE;
  }

  try {
    const rawValue = window.localStorage.getItem(STORAGE_KEY);
    if (!rawValue) {
      return DEFAULT_CITY_STATE;
    }

    const parsed = JSON.parse(rawValue) as Partial<CitySnapshot>;
    return {
      placements: sanitizePlacements(parsed.placements),
      funds:
        typeof parsed.funds === "number" && Number.isFinite(parsed.funds)
          ? parsed.funds
          : STARTING_FUNDS,
      turn:
        typeof parsed.turn === "number" && parsed.turn > 0 && Number.isFinite(parsed.turn)
          ? parsed.turn
          : 1,
      cityName:
        typeof parsed.cityName === "string" && parsed.cityName.trim().length > 0
          ? parsed.cityName
          : DEFAULT_CITY_STATE.cityName,
      prestige:
        typeof parsed.prestige === "number" && Number.isFinite(parsed.prestige)
          ? clamp(parsed.prestige, 0, 100)
          : STARTING_PRESTIGE,
      stability:
        typeof parsed.stability === "number" && Number.isFinite(parsed.stability)
          ? clamp(parsed.stability, 0, 100)
          : STARTING_STABILITY,
      turnLog: sanitizeTurnLog(parsed.turnLog),
    };
  } catch {
    return DEFAULT_CITY_STATE;
  }
}

function loadPrefs(): UiPrefs {
  if (typeof window === "undefined") {
    return DEFAULT_PREFS;
  }

  try {
    const rawValue = window.localStorage.getItem(PREFS_KEY);
    if (!rawValue) {
      return DEFAULT_PREFS;
    }

    const parsed = JSON.parse(rawValue) as Partial<UiPrefs>;
    return {
      activePalette: parsed.activePalette === "fantasy" ? "fantasy" : "urban",
      viewMode: parsed.viewMode === "build" ? "build" : "survey",
      interactionMode: parsed.interactionMode === "erase" ? "erase" : "build",
      showDecorations:
        typeof parsed.showDecorations === "boolean"
          ? parsed.showDecorations
          : DEFAULT_PREFS.showDecorations,
      showGrid:
        typeof parsed.showGrid === "boolean" ? parsed.showGrid : DEFAULT_PREFS.showGrid,
      affordableOnly:
        typeof parsed.affordableOnly === "boolean"
          ? parsed.affordableOnly
          : DEFAULT_PREFS.affordableOnly,
      toolSearch:
        typeof parsed.toolSearch === "string" ? parsed.toolSearch : DEFAULT_PREFS.toolSearch,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function loadSaveSlots(): Partial<Record<SaveSlotId, SaveSlot>> {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const rawValue = window.localStorage.getItem(SLOTS_KEY);
    if (!rawValue) {
      return {};
    }

    const parsed = JSON.parse(rawValue) as Partial<Record<SaveSlotId, SaveSlot>>;
    const nextSlots: Partial<Record<SaveSlotId, SaveSlot>> = {};

    (["A", "B", "C"] as SaveSlotId[]).forEach((slotId) => {
      const slot = parsed[slotId];
      if (!slot) {
        return;
      }

      nextSlots[slotId] = {
        id: slotId,
        name: typeof slot.name === "string" ? slot.name : `Slot ${slotId}`,
        savedAt: typeof slot.savedAt === "string" ? slot.savedAt : new Date().toISOString(),
        snapshot: {
          placements: sanitizePlacements(slot.snapshot?.placements),
          funds:
            typeof slot.snapshot?.funds === "number" && Number.isFinite(slot.snapshot.funds)
              ? slot.snapshot.funds
              : STARTING_FUNDS,
          turn:
            typeof slot.snapshot?.turn === "number" && slot.snapshot.turn > 0
              ? slot.snapshot.turn
              : 1,
          cityName:
            typeof slot.snapshot?.cityName === "string" && slot.snapshot.cityName.trim().length > 0
              ? slot.snapshot.cityName
              : DEFAULT_CITY_STATE.cityName,
          prestige:
            typeof slot.snapshot?.prestige === "number"
              ? clamp(slot.snapshot.prestige, 0, 100)
              : STARTING_PRESTIGE,
          stability:
            typeof slot.snapshot?.stability === "number"
              ? clamp(slot.snapshot.stability, 0, 100)
              : STARTING_STABILITY,
          turnLog: sanitizeTurnLog(slot.snapshot?.turnLog),
        },
      };
    });

    return nextSlots;
  } catch {
    return {};
  }
}

function computeMetrics(snapshot: CitySnapshot) {
  const { placements, funds, prestige, stability } = snapshot;
  const totalCells = GRID_SIZE * GRID_SIZE - RESERVED_CELL_COUNT;
  const occupiedCells = placements.length;
  const freeLots = totalCells - occupiedCells;

  const counts = TOOL_ORDER.reduce<Record<BuildType, number>>((accumulator, type) => {
    accumulator[type] = placements.filter((placement) => placement.type === type).length;
    return accumulator;
  }, {} as Record<BuildType, number>);

  const totalPopulation = placements.reduce(
    (sum, placement) => sum + BUILDING_CATALOG[placement.type].population,
    0,
  );
  const grossIncome =
    BASE_TURN_INCOME +
    placements.reduce((sum, placement) => sum + BUILDING_CATALOG[placement.type].income, 0);
  const totalMaintenance = placements.reduce(
    (sum, placement) => sum + BUILDING_CATALOG[placement.type].maintenance,
    0,
  );
  const netIncome = grossIncome - totalMaintenance;
  const totalEnergy =
    90 + placements.reduce((sum, placement) => sum + BUILDING_CATALOG[placement.type].energy, 0);
  const totalAppeal = placements.reduce(
    (sum, placement) => sum + BUILDING_CATALOG[placement.type].appeal,
    0,
  );
  const cityScore = Math.max(
    0,
    Math.round(totalPopulation * 1.2 + netIncome * 1.7 + totalAppeal * 1.8 + prestige * 1.6),
  );
  const developmentStage =
    occupiedCells < 8
      ? "Posto inicial"
      : occupiedCells < 18
        ? "Distrito emergente"
        : occupiedCells < 32
          ? "Cidade em expansao"
          : "Metropole estrategica";
  const economyStatus =
    funds < 150 ? "Caixa apertado" : netIncome > 80 ? "Ritmo forte" : "Crescimento estavel";
  const energyStatus =
    totalEnergy < 0 ? "Apagao iminente" : totalEnergy < 30 ? "Rede pressionada" : "Rede segura";
  const warnings = [
    ...(funds < 150 ? ["Seu caixa esta baixo para novas obras maiores."] : []),
    ...(netIncome < 0 ? ["O fluxo por turno esta negativo."] : []),
    ...(totalEnergy < 0 ? ["A energia entrou no vermelho e precisa de alivio."] : []),
    ...(prestige < 25 ? ["O prestigio da cidade esta fraco para uma capital memoravel."] : []),
    ...(stability < 35 ? ["A estabilidade caiu demais e pode afetar o proximo ciclo."] : []),
  ];

  return {
    counts,
    totalCells,
    occupiedCells,
    freeLots,
    occupancy: Math.round((occupiedCells / totalCells) * 100),
    totalPopulation,
    grossIncome,
    totalMaintenance,
    netIncome,
    totalEnergy,
    totalAppeal,
    cityScore,
    prestige,
    stability,
    developmentStage,
    economyStatus,
    energyStatus,
    warnings,
    rtsStructures:
      counts.townCenter +
      counts.market +
      counts.barracks +
      counts.watchTower +
      counts.windmill +
      counts.temple +
      counts.farm,
    totalBuildings: occupiedCells,
  };
}

function createObjectives(snapshot: CitySnapshot) {
  const metrics = computeMetrics(snapshot);

  return [
    {
      label: "Chegar a 24 de populacao",
      current: metrics.totalPopulation,
      target: 24,
      complete: metrics.totalPopulation >= 24,
    },
    {
      label: "Gerar 60 por turno",
      current: metrics.netIncome,
      target: 60,
      complete: metrics.netIncome >= 60,
    },
    {
      label: "Prestigio 55",
      current: snapshot.prestige,
      target: 55,
      complete: snapshot.prestige >= 55,
    },
    {
      label: "Estabilidade 72",
      current: snapshot.stability,
      target: 72,
      complete: snapshot.stability >= 72,
    },
    {
      label: "6 estruturas RTS",
      current: metrics.rtsStructures,
      target: 6,
      complete: metrics.rtsStructures >= 6,
    },
  ] satisfies Objective[];
}

function rollTurnEvent(snapshot: CitySnapshot) {
  const metrics = computeMetrics(snapshot);
  const candidates: Array<Omit<TurnLogEntry, "turn"> & { when: boolean }> = [
    {
      when: metrics.counts.farm + metrics.counts.windmill > 0,
      title: "Feira da colheita",
      summary: "O distrito rural puxou visitantes e aqueceu a economia.",
      kind: "good",
      fundsDelta: 60,
      prestigeDelta: 2,
      stabilityDelta: 1,
    },
    {
      when: metrics.counts.factory > 0,
      title: "Contrato industrial",
      summary: "Uma encomenda grande reforcou o caixa, mas apertou a rotina das ruas.",
      kind: "good",
      fundsDelta: 85,
      prestigeDelta: 0,
      stabilityDelta: -2,
    },
    {
      when: metrics.counts.market + metrics.counts.house >= 4,
      title: "Semana comercial",
      summary: "O fluxo de compradores girou mais rapido que o esperado.",
      kind: "good",
      fundsDelta: 48,
      prestigeDelta: 1,
      stabilityDelta: 0,
    },
    {
      when: metrics.totalEnergy < 15,
      title: "Pico de demanda",
      summary: "A rede sentiu a pressao e forçou manutencao extra.",
      kind: "warning",
      fundsDelta: -70,
      prestigeDelta: -1,
      stabilityDelta: -5,
    },
    {
      when: metrics.rtsStructures >= 3,
      title: "Desfile civico",
      summary: "Os marcos principais deram cara de capital ao assentamento.",
      kind: "good",
      fundsDelta: 24,
      prestigeDelta: 3,
      stabilityDelta: 1,
    },
    {
      when: metrics.netIncome < 0,
      title: "Caixa pressionado",
      summary: "Despesas extras reduziram o animo da equipe e o ritmo do caixa.",
      kind: "warning",
      fundsDelta: -36,
      prestigeDelta: 0,
      stabilityDelta: -3,
    },
    {
      when: true,
      title: "Turno de rotina",
      summary: "A cidade atravessou o ciclo sem grandes sobressaltos.",
      kind: "neutral",
      fundsDelta: 0,
      prestigeDelta: 1,
      stabilityDelta: 1,
    },
  ];

  const available = candidates.filter((candidate) => candidate.when);
  const selected = available[(snapshot.turn + metrics.totalBuildings + metrics.cityScore) % available.length];

  return {
    turn: snapshot.turn + 1,
    title: selected.title,
    summary: selected.summary,
    kind: selected.kind,
    fundsDelta: selected.fundsDelta,
    prestigeDelta: selected.prestigeDelta,
    stabilityDelta: selected.stabilityDelta,
  } satisfies TurnLogEntry;
}

function formatSavedAt(savedAt: string) {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(savedAt));
  } catch {
    return savedAt;
  }
}

function GridOverview({ placements }: { placements: BuildingPlacement[] }) {
  const placementKeys = useMemo(
    () => new Set(placements.map((placement) => getPlacementKey(placement.x, placement.z))),
    [placements],
  );

  return (
    <div className="grid-overview">
      {Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, index) => {
        const x = index % GRID_SIZE;
        const z = Math.floor(index / GRID_SIZE);
        const key = getPlacementKey(x, z);
        const isPlaced = placementKeys.has(key);
        const isBlocked = isReservedCell(x, z);

        return (
          <span
            key={key}
            className={`grid-overview__cell${isPlaced ? " is-placed" : ""}${isBlocked ? " is-blocked" : ""}`}
          />
        );
      })}
    </div>
  );
}

function App() {
  const initialState = useMemo(loadCityState, []);
  const initialPrefs = useMemo(loadPrefs, []);
  const initialSlots = useMemo(loadSaveSlots, []);

  const [cityState, setCityState] = useState<CitySnapshot>(initialState);
  const [activePalette, setActivePalette] = useState<Palette>(initialPrefs.activePalette);
  const [viewMode, setViewMode] = useState<ViewMode>(initialPrefs.viewMode);
  const [interactionMode, setInteractionMode] = useState<InteractionMode>(
    initialPrefs.interactionMode,
  );
  const [showDecorations, setShowDecorations] = useState(initialPrefs.showDecorations);
  const [showGrid, setShowGrid] = useState(initialPrefs.showGrid);
  const [affordableOnly, setAffordableOnly] = useState(initialPrefs.affordableOnly);
  const [toolSearch, setToolSearch] = useState(initialPrefs.toolSearch);
  const deferredToolSearch = useDeferredValue(toolSearch);
  const [selectedTool, setSelectedTool] = useState<BuildType>("house");
  const [history, setHistory] = useState<CitySnapshot[]>([]);
  const [futureHistory, setFutureHistory] = useState<CitySnapshot[]>([]);
  const [hoveredCell, setHoveredCell] = useState<HoveredCell | null>(null);
  const [saveSlots, setSaveSlots] = useState<Partial<Record<SaveSlotId, SaveSlot>>>(initialSlots);
  const [importText, setImportText] = useState("");
  const [lastAction, setLastAction] = useState(
    "Escolha uma construcao no painel e clique no grid para expandir o mapa.",
  );

  const { placements, funds, turn, cityName, prestige, stability, turnLog } = cityState;
  const metrics = useMemo(() => computeMetrics(cityState), [cityState]);
  const objectives = useMemo(() => createObjectives(cityState), [cityState]);
  const selectedCard = BUILDING_CATALOG[selectedTool];
  const selectedAffordable = useMemo(() => {
    const bestRefund = placements.reduce((highestRefund, placement) => {
      const refund = Math.round(BUILDING_CATALOG[placement.type].cost * REFUND_RATE);
      return Math.max(highestRefund, refund);
    }, 0);

    return funds >= selectedCard.cost || funds + bestRefund >= selectedCard.cost;
  }, [funds, placements, selectedCard.cost]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cityState));
  }, [cityState]);

  useEffect(() => {
    const nextPrefs: UiPrefs = {
      activePalette,
      viewMode,
      interactionMode,
      showDecorations,
      showGrid,
      affordableOnly,
      toolSearch,
    };
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(nextPrefs));
  }, [
    activePalette,
    viewMode,
    interactionMode,
    showDecorations,
    showGrid,
    affordableOnly,
    toolSearch,
  ]);

  useEffect(() => {
    window.localStorage.setItem(SLOTS_KEY, JSON.stringify(saveSlots));
  }, [saveSlots]);

  useEffect(() => {
    if (BUILDING_CATALOG[selectedTool].palette === activePalette) {
      return;
    }

    const firstTool = TOOL_ORDER.find((tool) => BUILDING_CATALOG[tool].palette === activePalette);

    if (firstTool) {
      setSelectedTool(firstTool);
    }
  }, [activePalette, selectedTool]);

  const pushHistory = (snapshot: CitySnapshot) => {
    setHistory((currentHistory) => [...currentHistory, cloneSnapshot(snapshot)]);
    setFutureHistory([]);
  };

  const applySnapshot = (snapshot: CitySnapshot, message: string) => {
    startTransition(() => {
      setCityState(cloneSnapshot(snapshot));
      setHoveredCell(null);
      setLastAction(message);
    });
  };

  const handleUndoSnapshot = () => {
    setHistory((currentHistory) => {
      const previousSnapshot = currentHistory.at(-1);

      if (!previousSnapshot) {
        setLastAction("Nao ha uma acao recente para desfazer.");
        return currentHistory;
      }

      setFutureHistory((currentFuture) => [...currentFuture, cloneSnapshot(cityState)]);
      applySnapshot(previousSnapshot, "Ultima acao desfeita e cidade restaurada.");
      return currentHistory.slice(0, -1);
    });
  };

  const handleRedoSnapshot = () => {
    setFutureHistory((currentFuture) => {
      const nextSnapshot = currentFuture.at(-1);

      if (!nextSnapshot) {
        setLastAction("Nao ha uma acao recente para refazer.");
        return currentFuture;
      }

      setHistory((currentHistory) => [...currentHistory, cloneSnapshot(cityState)]);
      applySnapshot(nextSnapshot, "Acao refeita com sucesso.");
      return currentFuture.slice(0, -1);
    });
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase();
      if (tagName === "input" || tagName === "textarea" || target?.isContentEditable) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === "g") {
        setShowGrid((currentValue) => !currentValue);
        return;
      }

      if (key === "d") {
        setShowDecorations((currentValue) => !currentValue);
        return;
      }

      if (key === "v") {
        setViewMode((currentValue) => (currentValue === "survey" ? "build" : "survey"));
        return;
      }

      if (key === "x") {
        setInteractionMode((currentValue) => (currentValue === "build" ? "erase" : "build"));
        return;
      }

      if (key === "f") {
        setAffordableOnly((currentValue) => !currentValue);
        return;
      }

      if ((event.ctrlKey || event.metaKey) && key === "z" && !event.shiftKey) {
        event.preventDefault();
        handleUndoSnapshot();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && (key === "y" || (key === "z" && event.shiftKey))) {
        event.preventDefault();
        handleRedoSnapshot();
        return;
      }

      if (key === "1") {
        setActivePalette("urban");
        return;
      }

      if (key === "2") {
        setActivePalette("fantasy");
        return;
      }

      if (key === "enter") {
        setCityState((currentState) => {
          const currentMetrics = computeMetrics(currentState);
          const eventInfo = rollTurnEvent(currentState);
          const prestigeDelta = eventInfo.prestigeDelta + (currentMetrics.totalAppeal > 18 ? 1 : 0);
          const stabilityDelta =
            eventInfo.stabilityDelta +
            (currentMetrics.totalEnergy < 0 ? -4 : currentMetrics.netIncome < 0 ? -2 : 1);

          pushHistory(currentState);
          setLastAction(
            `Turno ${currentState.turn + 1} iniciado. Evento: ${eventInfo.title}. Caixa ${currentState.funds + currentMetrics.netIncome + eventInfo.fundsDelta}.`,
          );

          return {
            ...currentState,
            turn: currentState.turn + 1,
            funds: currentState.funds + currentMetrics.netIncome + eventInfo.fundsDelta,
            prestige: clamp(currentState.prestige + prestigeDelta, 0, 100),
            stability: clamp(currentState.stability + stabilityDelta, 0, 100),
            turnLog: [eventInfo, ...currentState.turnLog].slice(0, 8),
          };
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  const paletteTools = useMemo(
    () =>
      TOOL_ORDER.filter((tool) => {
        const spec = BUILDING_CATALOG[tool];
        const matchesPalette = spec.palette === activePalette;
        const matchesSearch =
          deferredToolSearch.trim().length === 0 ||
          spec.label.toLowerCase().includes(deferredToolSearch.toLowerCase()) ||
          spec.description.toLowerCase().includes(deferredToolSearch.toLowerCase());
        const matchesFunds = !affordableOnly || funds >= spec.cost;

        return matchesPalette && matchesSearch && matchesFunds;
      }),
    [activePalette, affordableOnly, deferredToolSearch, funds],
  );

  const hoveredPlacement = useMemo(() => {
    if (!hoveredCell) {
      return null;
    }

    return (
      placements.find(
        (placement) => placement.x === hoveredCell.x && placement.z === hoveredCell.z,
      ) ?? null
    );
  }, [hoveredCell, placements]);

  const hoveredIsReserved = useMemo(() => {
    if (!hoveredCell) {
      return false;
    }

    return isReservedCell(hoveredCell.x, hoveredCell.z);
  }, [hoveredCell]);

  const hoveredRoadAccess = useMemo(() => {
    if (!hoveredCell) {
      return false;
    }

    const placementsWithoutCurrent = placements.filter(
      (placement) => placement.x !== hoveredCell.x || placement.z !== hoveredCell.z,
    );

    return hasRoadAccess(hoveredCell.x, hoveredCell.z, placementsWithoutCurrent);
  }, [hoveredCell, placements]);

  const replacementDelta = useMemo(() => {
    if (!hoveredPlacement) {
      return -selectedCard.cost;
    }

    return (
      Math.round(BUILDING_CATALOG[hoveredPlacement.type].cost * REFUND_RATE) - selectedCard.cost
    );
  }, [hoveredPlacement, selectedCard.cost, hoveredPlacement?.type]);

  const hoveredRefund = useMemo(() => {
    if (!hoveredPlacement) {
      return 0;
    }

    return Math.round(BUILDING_CATALOG[hoveredPlacement.type].cost * REFUND_RATE);
  }, [hoveredPlacement]);

  const hoveredCanBuild = useMemo(() => {
    if (!hoveredCell || hoveredIsReserved) {
      return false;
    }

    if (hoveredPlacement?.type === selectedTool) {
      return false;
    }

    const effectiveFunds = funds + hoveredRefund;
    if (effectiveFunds < selectedCard.cost) {
      return false;
    }

    return !selectedCard.requiresRoadAccess || hoveredRoadAccess;
  }, [
    funds,
    hoveredCell,
    hoveredIsReserved,
    hoveredPlacement,
    hoveredRefund,
    hoveredRoadAccess,
    selectedCard.cost,
    selectedCard.requiresRoadAccess,
    selectedTool,
  ]);

  const handleAdvanceTurn = () => {
    setCityState((currentState) => {
      const currentMetrics = computeMetrics(currentState);
      const eventInfo = rollTurnEvent(currentState);
      const prestigeDelta = eventInfo.prestigeDelta + (currentMetrics.totalAppeal > 18 ? 1 : 0);
      const stabilityDelta =
        eventInfo.stabilityDelta +
        (currentMetrics.totalEnergy < 0 ? -4 : currentMetrics.netIncome < 0 ? -2 : 1);

      pushHistory(currentState);
      setLastAction(
        `Turno ${currentState.turn + 1} iniciado. Evento: ${eventInfo.title}. Caixa ${currentState.funds + currentMetrics.netIncome + eventInfo.fundsDelta}.`,
      );

      return {
        ...currentState,
        turn: currentState.turn + 1,
        funds: currentState.funds + currentMetrics.netIncome + eventInfo.fundsDelta,
        prestige: clamp(currentState.prestige + prestigeDelta, 0, 100),
        stability: clamp(currentState.stability + stabilityDelta, 0, 100),
        turnLog: [eventInfo, ...currentState.turnLog].slice(0, 8),
      };
    });
  };

  const handlePlaceBuilding = (x: number, z: number) => {
    if (interactionMode === "erase") {
      if (isReservedCell(x, z)) {
        setLastAction("Esse lote faz parte do cenario base e nao pode ser apagado.");
        return;
      }

      setCityState((currentState) => {
        const existingPlacement = currentState.placements.find(
          (placement) => placement.x === x && placement.z === z,
        );

        if (!existingPlacement) {
          setLastAction("Nao existe uma construcao sua nesse lote para remover.");
          return currentState;
        }

        const refund = Math.round(BUILDING_CATALOG[existingPlacement.type].cost * REFUND_RATE);
        pushHistory(currentState);
        setLastAction(
          `${BUILDING_CATALOG[existingPlacement.type].label} removida do lote ${x + 1}:${z + 1}. Reembolso ${refund}.`,
        );

        return {
          ...currentState,
          placements: currentState.placements.filter(
            (placement) => placement.x !== x || placement.z !== z,
          ),
          funds: currentState.funds + refund,
        };
      });
      return;
    }

    if (isReservedCell(x, z)) {
      setLastAction("Esse lote ja esta ocupado pela infraestrutura do mapa.");
      return;
    }

    setCityState((currentState) => {
      const existingPlacement = currentState.placements.find(
        (placement) => placement.x === x && placement.z === z,
      );
      const placementsWithoutCurrent = currentState.placements.filter(
        (placement) => placement.x !== x || placement.z !== z,
      );

      if (existingPlacement?.type === selectedTool) {
        setLastAction(
          `${selectedCard.label} ja esta nesse lote ${x + 1}:${z + 1}. Escolha outro.`,
        );
        return currentState;
      }

      if (
        selectedCard.requiresRoadAccess &&
        !hasRoadAccess(x, z, placementsWithoutCurrent)
      ) {
        setLastAction(`${selectedCard.label} precisa ficar ao lado de uma estrada.`);
        return currentState;
      }

      let fundsDelta = -selectedCard.cost;
      if (existingPlacement) {
        fundsDelta += Math.round(BUILDING_CATALOG[existingPlacement.type].cost * REFUND_RATE);
      }

      if (currentState.funds + fundsDelta < 0) {
        const shortage = Math.abs(currentState.funds + fundsDelta);
        setLastAction(
          existingPlacement
            ? `A troca desse lote ainda precisa de ${shortage} no caixa.`
            : `Faltam ${shortage} para construir ${selectedCard.label}.`,
        );
        return currentState;
      }

      pushHistory(currentState);
      setLastAction(
        `${selectedCard.label} colocada no lote ${x + 1}:${z + 1}. Caixa atual ${currentState.funds + fundsDelta}.`,
      );

      return {
        ...currentState,
        placements: [...placementsWithoutCurrent, { x, z, type: selectedTool }],
        funds: currentState.funds + fundsDelta,
      };
    });
  };

  const handleApplyTemplate = (templateId: string) => {
    const template = TEMPLATE_PRESETS.find((item) => item.id === templateId);
    if (!template) {
      return;
    }

    const filteredPlacements = sanitizePlacements(template.placements);
    const spent = filteredPlacements.reduce(
      (sum, placement) => sum + BUILDING_CATALOG[placement.type].cost,
      0,
    );
    const nextState: CitySnapshot = {
      ...cityState,
      placements: filteredPlacements,
      funds: Math.max(STARTING_FUNDS - spent, 260),
      turn: 1,
      prestige: STARTING_PRESTIGE,
      stability: STARTING_STABILITY,
      turnLog: [],
    };

    pushHistory(cityState);
    applySnapshot(
      nextState,
      `Template ${template.label} aplicado com ${filteredPlacements.length} lotes.`,
    );
  };

  const handleSaveSlot = (slotId: SaveSlotId) => {
    const snapshot = cloneSnapshot(cityState);
    const slot: SaveSlot = {
      id: slotId,
      name: snapshot.cityName,
      savedAt: new Date().toISOString(),
      snapshot,
    };

    setSaveSlots((currentSlots) => ({ ...currentSlots, [slotId]: slot }));
    setLastAction(`Cidade salva no slot ${slotId}.`);
  };

  const handleLoadSlot = (slotId: SaveSlotId) => {
    const slot = saveSlots[slotId];

    if (!slot) {
      setLastAction(`O slot ${slotId} ainda esta vazio.`);
      return;
    }

    pushHistory(cityState);
    applySnapshot(slot.snapshot, `Slot ${slotId} carregado: ${slot.name}.`);
  };

  const handleDeleteSlot = (slotId: SaveSlotId) => {
    setSaveSlots((currentSlots) => {
      const nextSlots = { ...currentSlots };
      delete nextSlots[slotId];
      return nextSlots;
    });
    setLastAction(`Slot ${slotId} apagado.`);
  };

  const handleResetCity = () => {
    setHistory([]);
    setFutureHistory([]);
    applySnapshot(DEFAULT_CITY_STATE, "Cidade reiniciada para um novo ciclo.");
  };

  const handleResetMap = () => {
    if (placements.length === 0) {
      setLastAction("O mapa ja esta limpo.");
      return;
    }

    pushHistory(cityState);
    setCityState((currentState) => ({
      ...currentState,
      placements: [],
    }));
    setLastAction("As construcoes do jogador foram limpas e o terreno voltou ao estado inicial.");
  };

  const handleClearSelectedType = () => {
    const placementsOfType = placements.filter((placement) => placement.type === selectedTool);

    if (placementsOfType.length === 0) {
      setLastAction(`Nao existem construcoes do tipo ${selectedCard.label} no mapa.`);
      return;
    }

    const refund = placementsOfType.reduce(
      (sum, placement) => sum + Math.round(BUILDING_CATALOG[placement.type].cost * REFUND_RATE),
      0,
    );

    pushHistory(cityState);
    setCityState((currentState) => ({
      ...currentState,
      placements: currentState.placements.filter((placement) => placement.type !== selectedTool),
      funds: currentState.funds + refund,
    }));
    setLastAction(
      `${placementsOfType.length} lote(s) do tipo ${selectedCard.label} removidos. Reembolso ${refund}.`,
    );
  };

  const handleExportJson = async () => {
    const payload = JSON.stringify(cityState, null, 2);
    setImportText(payload);

    try {
      await navigator.clipboard.writeText(payload);
      setLastAction("Estado da cidade copiado em JSON para a area de transferencia.");
    } catch {
      setLastAction("JSON preparado no campo de importacao/exportacao.");
    }
  };

  const handleImportJson = () => {
    try {
      const parsed = JSON.parse(importText) as Partial<CitySnapshot> | BuildingPlacement[];

      const nextSnapshot: CitySnapshot = Array.isArray(parsed)
        ? {
            ...cityState,
            placements: sanitizePlacements(parsed),
          }
        : {
            placements: sanitizePlacements(parsed.placements),
            funds:
              typeof parsed.funds === "number" && Number.isFinite(parsed.funds)
                ? parsed.funds
                : cityState.funds,
            turn:
              typeof parsed.turn === "number" && parsed.turn > 0 ? parsed.turn : cityState.turn,
            cityName:
              typeof parsed.cityName === "string" && parsed.cityName.trim().length > 0
                ? parsed.cityName
                : cityState.cityName,
            prestige:
              typeof parsed.prestige === "number"
                ? clamp(parsed.prestige, 0, 100)
                : cityState.prestige,
            stability:
              typeof parsed.stability === "number"
                ? clamp(parsed.stability, 0, 100)
                : cityState.stability,
            turnLog: sanitizeTurnLog(parsed.turnLog),
          };

      pushHistory(cityState);
      applySnapshot(nextSnapshot, "JSON importado e aplicado na cidade atual.");
    } catch {
      setLastAction("O JSON informado nao esta valido.");
    }
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Planejamento Urbano e RTS</p>
          <input
            className="city-name-input"
            value={cityName}
            onChange={(event) =>
              setCityState((currentState) => ({
                ...currentState,
                cityName: event.target.value || "Nova Aurora",
              }))
            }
            aria-label="Nome da cidade"
          />
          <p className="intro">
            Mapa 3D aberto com economia real, templates, saves locais, filtros, hover por lote e
            mais ferramentas para o seu sandbox virar um city builder jogavel.
          </p>
        </div>
        <div className="summary-stack">
          <div className="summary-chip">
            <span>Turno</span>
            <strong>{turn}</strong>
          </div>
          <div className="summary-chip">
            <span>Caixa</span>
            <strong>{funds}</strong>
          </div>
          <div className="summary-chip">
            <span>Prestigio</span>
            <strong>{prestige}</strong>
          </div>
          <div className="summary-chip">
            <span>Estabilidade</span>
            <strong>{stability}</strong>
          </div>
          <button type="button" className="primary-button" onClick={handleAdvanceTurn}>
            Avancar turno
          </button>
        </div>
      </header>

      <main className="app-layout">
        <section className="scene-panel">
          <div className="scene-panel__bar">
            <div>
              <h2>Mapa 3D</h2>
              <p>Arraste para girar, use scroll para zoom e clique no grid para construir.</p>
            </div>
            <span className="scene-tag">{metrics.occupancy}% ocupado</span>
          </div>

          <div className="scene-toolbar">
            <div className="toggle-group">
              <button
                type="button"
                className={`toggle-pill${viewMode === "survey" ? " is-active" : ""}`}
                onClick={() => setViewMode("survey")}
              >
                Vista aberta
              </button>
              <button
                type="button"
                className={`toggle-pill${viewMode === "build" ? " is-active" : ""}`}
                onClick={() => setViewMode("build")}
              >
                Vista de construcao
              </button>
            </div>

            <div className="toggle-group">
              <button
                type="button"
                className={`toggle-pill${showDecorations ? " is-active" : ""}`}
                onClick={() => setShowDecorations((currentValue) => !currentValue)}
              >
                Decoracao {showDecorations ? "on" : "off"}
              </button>
              <button
                type="button"
                className={`toggle-pill${showGrid ? " is-active" : ""}`}
                onClick={() => setShowGrid((currentValue) => !currentValue)}
              >
                Grid {showGrid ? "on" : "off"}
              </button>
              <button
                type="button"
                className={`toggle-pill${affordableOnly ? " is-active" : ""}`}
                onClick={() => setAffordableOnly((currentValue) => !currentValue)}
              >
                So acessiveis {affordableOnly ? "on" : "off"}
              </button>
            </div>
          </div>

          <Suspense
            fallback={
              <div className="scene-fallback">
                <strong>Preparando o mapa 3D...</strong>
                <span>Carregando terreno, props e estruturas de construcao.</span>
              </div>
            }
          >
            <CityBuilderScene
              placements={placements}
              selectedTool={selectedTool}
              onPlaceBuilding={handlePlaceBuilding}
              hoveredCell={hoveredCell}
              onHoverCellChange={setHoveredCell}
              showDecorations={showDecorations}
              showGrid={showGrid}
              viewMode={viewMode}
              interactionMode={interactionMode}
              canPlaceSelected={selectedAffordable}
              hoverCanBuild={hoveredCanBuild}
              hoverHasPlacement={Boolean(hoveredPlacement)}
              hoverIsReserved={hoveredIsReserved}
              hoverRoadAccess={hoveredRoadAccess}
              requiresRoadAccessSelected={selectedCard.requiresRoadAccess}
            />
          </Suspense>
        </section>

        <aside className="sidebar">
          <section className="sidebar-card">
            <div className="sidebar-card__header">
              <h2>Ferramentas</h2>
              <div className="sidebar-actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={handleUndoSnapshot}
                  disabled={history.length === 0}
                >
                  Desfazer
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={handleRedoSnapshot}
                  disabled={futureHistory.length === 0}
                >
                  Refazer
                </button>
                <button type="button" className="ghost-button" onClick={handleResetMap}>
                  Limpar mapa
                </button>
                <button type="button" className="ghost-button" onClick={handleResetCity}>
                  Nova cidade
                </button>
              </div>
            </div>

            <div className="palette-switcher">
              {(Object.keys(PALETTE_LABELS) as Palette[]).map((palette) => (
                <button
                  key={palette}
                  type="button"
                  className={`palette-button${activePalette === palette ? " is-active" : ""}`}
                  onClick={() => setActivePalette(palette)}
                >
                  {PALETTE_LABELS[palette]}
                </button>
              ))}
            </div>

            <div className="mode-switcher">
              <button
                type="button"
                className={`mode-button${interactionMode === "build" ? " is-active" : ""}`}
                onClick={() => setInteractionMode("build")}
              >
                Construir
              </button>
              <button
                type="button"
                className={`mode-button${interactionMode === "erase" ? " is-active is-danger" : ""}`}
                onClick={() => setInteractionMode("erase")}
              >
                Apagar lote
              </button>
            </div>

            <div className="field-stack">
              <input
                className="panel-input"
                value={toolSearch}
                onChange={(event) => setToolSearch(event.target.value)}
                placeholder="Buscar construcoes"
                aria-label="Buscar construcoes"
              />
            </div>

            <div className="tool-grid">
              {paletteTools.length > 0 ? (
                paletteTools.map((tool) => {
                  const item = BUILDING_CATALOG[tool];
                  const isAffordable = funds >= item.cost;
                  return (
                    <button
                      key={tool}
                      type="button"
                      className={`tool-button${selectedTool === tool ? " is-active" : ""}${!isAffordable ? " is-low-funds" : ""}`}
                      onClick={() => {
                        setInteractionMode("build");
                        setSelectedTool(tool);
                      }}
                    >
                      <span>{item.label}</span>
                      <small>Custo {item.cost}</small>
                    </button>
                  );
                })
              ) : (
                <div className="empty-message">Nenhuma construcao combina com o filtro atual.</div>
              )}
            </div>

            <div className="selection-card">
              <h3>{interactionMode === "erase" ? "Apagar lote" : selectedCard.label}</h3>
              <p>
                {interactionMode === "erase"
                  ? `Remove apenas construcoes colocadas por voce. Reembolso atual ${Math.round(REFUND_RATE * 100)}%.`
                  : selectedCard.description}
              </p>
              <dl className="selection-stats">
                <div>
                  <dt>Custo</dt>
                  <dd>{interactionMode === "erase" ? "0" : selectedCard.cost}</dd>
                </div>
                <div>
                  <dt>Liquido</dt>
                  <dd>
                    {interactionMode === "erase"
                      ? "libera"
                      : selectedCard.income - selectedCard.maintenance >= 0
                        ? `+${selectedCard.income - selectedCard.maintenance}`
                        : selectedCard.income - selectedCard.maintenance}
                  </dd>
                </div>
                <div>
                  <dt>Energia</dt>
                  <dd>{interactionMode === "erase" ? "recupera" : selectedCard.energy}</dd>
                </div>
                <div>
                  <dt>Apelo</dt>
                  <dd>{interactionMode === "erase" ? "limpa" : selectedCard.appeal}</dd>
                </div>
              </dl>
              {interactionMode === "build" && (
                <div className="selection-meta">
                  <span>
                    Acesso viario {selectedCard.requiresRoadAccess ? "necessario" : "livre"}
                  </span>
                  <span>{selectedAffordable ? "Caixa suficiente" : "Caixa insuficiente"}</span>
                </div>
              )}
              <div className="sidebar-actions">
                <button type="button" className="ghost-button" onClick={handleClearSelectedType}>
                  Limpar tipo
                </button>
              </div>
            </div>
          </section>

          <section className="sidebar-card">
            <h2>Lote em foco</h2>
            <div className="focus-card">
              <strong>
                {hoveredCell ? `Lote ${hoveredCell.x + 1}:${hoveredCell.z + 1}` : "Passe o mouse no grid"}
              </strong>
              <span>
                {hoveredCell
                  ? hoveredPlacement
                    ? `Sua construcao atual: ${BUILDING_CATALOG[hoveredPlacement.type].label}`
                    : isReservedCell(hoveredCell.x, hoveredCell.z)
                      ? "Area protegida do cenario base."
                      : "Lote livre para edicao."
                  : "O painel mostra coordenada, uso atual e contexto do lote."}
              </span>
              {hoveredCell && !isReservedCell(hoveredCell.x, hoveredCell.z) && (
                <span>
                  {interactionMode === "erase"
                    ? hoveredPlacement
                      ? `Reembolso estimado ${Math.round(BUILDING_CATALOG[hoveredPlacement.type].cost * REFUND_RATE)}.`
                      : "Nada para remover neste lote."
                    : selectedCard.requiresRoadAccess
                      ? hoveredRoadAccess
                        ? "Acesso viario disponivel."
                        : "Sem estrada adjacente para essa obra."
                      : `Troca prevista ${replacementDelta >= 0 ? `+${replacementDelta}` : replacementDelta}.`}
                </span>
              )}
            </div>
          </section>

          <section className="sidebar-card">
            <h2>Layouts rapidos</h2>
            <div className="template-list">
              {TEMPLATE_PRESETS.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  className="template-card"
                  onClick={() => handleApplyTemplate(template.id)}
                >
                  <strong>{template.label}</strong>
                  <span>{template.description}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="sidebar-card">
            <h2>Objetivos</h2>
            <div className="objective-list">
              {objectives.map((objective) => {
                const progress = clamp((objective.current / objective.target) * 100, 0, 100);
                return (
                  <article key={objective.label} className="objective-card">
                    <div className="objective-card__row">
                      <strong>{objective.label}</strong>
                      <span>
                        {objective.current}/{objective.target}
                      </span>
                    </div>
                    <div className="progress-track">
                      <div
                        className={`progress-fill${objective.complete ? " is-complete" : ""}`}
                        style={{ width: `${progress}%` }}
                      ></div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="sidebar-card">
            <h2>Slots de save</h2>
            <div className="save-slot-list">
              {(["A", "B", "C"] as SaveSlotId[]).map((slotId) => {
                const slot = saveSlots[slotId];
                return (
                  <article key={slotId} className="save-slot-card">
                    <div>
                      <strong>Slot {slotId}</strong>
                      <span>
                        {slot
                          ? `${slot.name} · ${slot.snapshot.placements.length} lotes · ${formatSavedAt(slot.savedAt)}`
                          : "vazio"}
                      </span>
                    </div>
                    <div className="slot-actions">
                      <button type="button" className="ghost-button" onClick={() => handleSaveSlot(slotId)}>
                        Salvar
                      </button>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => handleLoadSlot(slotId)}
                        disabled={!slot}
                      >
                        Carregar
                      </button>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => handleDeleteSlot(slotId)}
                        disabled={!slot}
                      >
                        Apagar
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="sidebar-card">
            <h2>JSON rapido</h2>
            <div className="sidebar-actions">
              <button type="button" className="ghost-button" onClick={handleExportJson}>
                Exportar
              </button>
              <button type="button" className="ghost-button" onClick={handleImportJson}>
                Importar
              </button>
              <button type="button" className="ghost-button" onClick={() => setImportText("")}>
                Limpar campo
              </button>
            </div>
            <textarea
              className="panel-textarea"
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
              placeholder="Cole aqui um JSON com placements ou um snapshot completo"
            />
          </section>

          <section className="sidebar-card">
            <h2>Visao do grid</h2>
            <GridOverview placements={placements} />
            <div className="overview-legend">
              <span>
                <i className="legend-dot is-empty"></i>
                livre
              </span>
              <span>
                <i className="legend-dot is-blocked"></i>
                fixa
              </span>
              <span>
                <i className="legend-dot is-placed"></i>
                sua
              </span>
            </div>
          </section>

          <section className="sidebar-card">
            <h2>Saude da cidade</h2>
            <div className="health-grid">
              <article>
                <span>Economia</span>
                <strong>{metrics.economyStatus}</strong>
              </article>
              <article>
                <span>Energia</span>
                <strong>{metrics.energyStatus}</strong>
              </article>
              <article>
                <span>Score</span>
                <strong>{metrics.cityScore}</strong>
              </article>
              <article>
                <span>Estagio</span>
                <strong>{metrics.developmentStage}</strong>
              </article>
            </div>
            {metrics.warnings.length > 0 && (
              <div className="warning-list">
                {metrics.warnings.map((warning) => (
                  <p key={warning} className="warning-copy">
                    {warning}
                  </p>
                ))}
              </div>
            )}
          </section>

          <section className="sidebar-card">
            <h2>Recursos da cidade</h2>
            <div className="resource-grid">
              <article>
                <span>Casas</span>
                <strong>{metrics.counts.house}</strong>
              </article>
              <article>
                <span>Estradas</span>
                <strong>{metrics.counts.road}</strong>
              </article>
              <article>
                <span>Fabricas</span>
                <strong>{metrics.counts.factory}</strong>
              </article>
              <article>
                <span>Estruturas RTS</span>
                <strong>{metrics.rtsStructures}</strong>
              </article>
              <article>
                <span>Terreno livre</span>
                <strong>{metrics.freeLots}</strong>
              </article>
              <article>
                <span>Populacao</span>
                <strong>{metrics.totalPopulation}</strong>
              </article>
              <article>
                <span>Receita</span>
                <strong>{metrics.grossIncome}</strong>
              </article>
              <article>
                <span>Manutencao</span>
                <strong>{metrics.totalMaintenance}</strong>
              </article>
              <article>
                <span>Saldo por turno</span>
                <strong>{metrics.netIncome}</strong>
              </article>
              <article>
                <span>Energia</span>
                <strong>{metrics.totalEnergy}</strong>
              </article>
              <article>
                <span>Apelo</span>
                <strong>{metrics.totalAppeal}</strong>
              </article>
              <article>
                <span>Total no mapa</span>
                <strong>{metrics.totalBuildings}</strong>
              </article>
            </div>
          </section>

          <section className="sidebar-card">
            <h2>Eventos recentes</h2>
            <div className="event-log">
              {turnLog.length > 0 ? (
                turnLog.map((entry) => (
                  <article key={`${entry.turn}-${entry.title}`} className={`event-log__item is-${entry.kind}`}>
                    <strong>
                      Turno {entry.turn}: {entry.title}
                    </strong>
                    <span>{entry.summary}</span>
                    <small>
                      Caixa {entry.fundsDelta >= 0 ? `+${entry.fundsDelta}` : entry.fundsDelta} ·
                      Prestigio {entry.prestigeDelta >= 0 ? ` +${entry.prestigeDelta}` : ` ${entry.prestigeDelta}`} ·
                      Estabilidade {entry.stabilityDelta >= 0 ? ` +${entry.stabilityDelta}` : ` ${entry.stabilityDelta}`}
                    </small>
                  </article>
                ))
              ) : (
                <div className="empty-message">Os eventos vao aparecer conforme os turnos avancarem.</div>
              )}
            </div>
          </section>

          <section className="sidebar-card">
            <h2>Atalhos</h2>
            <div className="shortcut-list">
              <span>
                <kbd>1</kbd> paleta urbana
              </span>
              <span>
                <kbd>2</kbd> paleta fantasy
              </span>
              <span>
                <kbd>V</kbd> troca a camera
              </span>
              <span>
                <kbd>G</kbd> liga ou desliga o grid
              </span>
              <span>
                <kbd>D</kbd> mostra ou esconde decoracao
              </span>
              <span>
                <kbd>F</kbd> filtra so opcoes acessiveis
              </span>
              <span>
                <kbd>X</kbd> alterna construir e apagar
              </span>
              <span>
                <kbd>Enter</kbd> avanca turno
              </span>
              <span>
                <kbd>Ctrl</kbd> + <kbd>Z</kbd> desfaz
              </span>
              <span>
                <kbd>Ctrl</kbd> + <kbd>Y</kbd> refaz
              </span>
            </div>
          </section>

          <section className="sidebar-card">
            <h2>Status</h2>
            <p className="status-copy">{lastAction}</p>
            <p className="status-note">
              As construcoes ficam salvas no navegador. Use a paleta urbana para densidade rapida
              e a fantasy RTS para marcos maiores no terreno.
            </p>
            <p className="status-note">Acoes para desfazer: {history.length} · para refazer: {futureHistory.length}</p>
          </section>
        </aside>
      </main>
    </div>
  );
}

export default App;
