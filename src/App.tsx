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
};

type CitySnapshot = {
  placements: BuildingPlacement[];
  funds: number;
  turn: number;
  cityName: string;
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

const STORAGE_KEY = "cidade-builder-state-v4";
const PREFS_KEY = "cidade-builder-prefs-v2";
const SLOTS_KEY = "cidade-builder-slots-v1";
const STARTING_FUNDS = 1400;
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
    description: "Casas, um mercado e producao leve para comecar rapido.",
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
    description: "Nucleo fantasy com defesa e marcos maiores.",
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
    description: "Expansao moderna com estradas e renda forte.",
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
};

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

function clonePlacements(placements: BuildingPlacement[]) {
  return placements.map((placement) => ({ ...placement }));
}

function cloneSnapshot(snapshot: CitySnapshot): CitySnapshot {
  return {
    ...snapshot,
    placements: clonePlacements(snapshot.placements),
  };
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
        },
      };
    });

    return nextSlots;
  } catch {
    return {};
  }
}

function computeMetrics(snapshot: CitySnapshot) {
  const { placements, funds } = snapshot;
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
    Math.round(totalPopulation * 1.3 + netIncome * 1.8 + totalAppeal * 2 + freeLots * 0.35),
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
    ...(freeLots < 20 ? ["O grid livre esta encolhendo. Planeje novos vazios."] : []),
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
    () => new Set(placements.map((placement) => `${placement.x}:${placement.z}`)),
    [placements],
  );

  return (
    <div className="grid-overview">
      {Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, index) => {
        const x = index % GRID_SIZE;
        const z = Math.floor(index / GRID_SIZE);
        const key = `${x}:${z}`;
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
  const [hoveredCell, setHoveredCell] = useState<HoveredCell | null>(null);
  const [saveSlots, setSaveSlots] = useState<Partial<Record<SaveSlotId, SaveSlot>>>(initialSlots);
  const [importText, setImportText] = useState("");
  const [lastAction, setLastAction] = useState(
    "Escolha uma construcao no painel e clique no grid para expandir o mapa.",
  );

  const { placements, funds, turn, cityName } = cityState;
  const metrics = useMemo(() => computeMetrics(cityState), [cityState]);
  const selectedCard = BUILDING_CATALOG[selectedTool];
  const selectedAffordable = funds >= selectedCard.cost;

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

      if ((event.ctrlKey || event.metaKey) && key === "z") {
        event.preventDefault();
        handleUndoSnapshot();
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
        handleAdvanceTurn();
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

  const pushHistory = (snapshot: CitySnapshot) => {
    setHistory((currentHistory) => [...currentHistory, cloneSnapshot(snapshot)]);
  };

  const applySnapshot = (snapshot: CitySnapshot, message: string) => {
    startTransition(() => {
      setCityState(cloneSnapshot(snapshot));
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

      applySnapshot(previousSnapshot, "Ultima acao desfeita e cidade restaurada.");
      return currentHistory.slice(0, -1);
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

    if (funds < selectedCard.cost) {
      setLastAction(
        `Faltam ${selectedCard.cost - funds} para construir ${selectedCard.label}.`,
      );
      return;
    }

    setCityState((currentState) => {
      const existingPlacement = currentState.placements.find(
        (placement) => placement.x === x && placement.z === z,
      );

      if (existingPlacement?.type === selectedTool) {
        setLastAction(
          `${selectedCard.label} ja esta nesse lote ${x + 1}:${z + 1}. Escolha outro.`,
        );
        return currentState;
      }

      let fundsDelta = -selectedCard.cost;
      if (existingPlacement) {
        fundsDelta += Math.round(BUILDING_CATALOG[existingPlacement.type].cost * REFUND_RATE);
      }

      if (currentState.funds + fundsDelta < 0) {
        setLastAction("A troca desse lote ainda nao cabe no caixa atual.");
        return currentState;
      }

      const nextPlacement = { x, z, type: selectedTool };
      const withoutCurrentCell = currentState.placements.filter(
        (placement) => placement.x !== x || placement.z !== z,
      );

      pushHistory(currentState);
      setLastAction(
        `${selectedCard.label} colocada no lote ${x + 1}:${z + 1}. Caixa atual ${currentState.funds + fundsDelta}.`,
      );

      return {
        ...currentState,
        placements: [...withoutCurrentCell, nextPlacement],
        funds: currentState.funds + fundsDelta,
      };
    });
  };

  const handleAdvanceTurn = () => {
    setCityState((currentState) => {
      const currentMetrics = computeMetrics(currentState);
      pushHistory(currentState);
      setLastAction(
        `Turno ${currentState.turn + 1} iniciado. Caixa mudou em ${currentMetrics.netIncome}.`,
      );

      return {
        ...currentState,
        turn: currentState.turn + 1,
        funds: currentState.funds + currentMetrics.netIncome,
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
    };

    pushHistory(cityState);
    applySnapshot(nextState, `Template ${template.label} aplicado com ${filteredPlacements.length} lotes.`);
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

  const handleResetCity = () => {
    pushHistory(cityState);
    applySnapshot(DEFAULT_CITY_STATE, "Cidade reiniciada para um novo ciclo.");
    setHistory([]);
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
      funds: currentState.funds,
    }));
    setLastAction("As construcoes do jogador foram limpas e o terreno voltou ao estado inicial.");
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
            Mapa 3D aberto com economia real, paletas separadas, camera ajustavel e varios fluxos
            de edicao para construir sem perder a vista.
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
              onHoverCellChange={setHoveredCell}
              showDecorations={showDecorations}
              showGrid={showGrid}
              viewMode={viewMode}
              interactionMode={interactionMode}
              canPlaceSelected={selectedAffordable}
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
                <button type="button" className="ghost-button" onClick={handleResetMap}>
                  Limpar
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
              {interactionMode === "build" && !selectedAffordable && (
                <p className="warning-copy">
                  Caixa insuficiente. Faltam {selectedCard.cost - funds} para esta obra.
                </p>
              )}
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
            </div>
          </section>

          <section className="sidebar-card">
            <h2>Status</h2>
            <p className="status-copy">{lastAction}</p>
            <p className="status-note">
              As construcoes ficam salvas no navegador. Use a paleta urbana para densidade rapida
              e a fantasy RTS para marcos maiores no terreno.
            </p>
            <p className="status-note">Acoes disponiveis para desfazer: {history.length}</p>
          </section>
        </aside>
      </main>
    </div>
  );
}

export default App;
