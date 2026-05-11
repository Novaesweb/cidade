import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import {
  GRID_SIZE,
  RESERVED_CELL_COUNT,
  isReservedCell,
  type BuildType,
  type BuildingPlacement,
} from "./components/cityBuilderConfig";
import "./App.css";

const STORAGE_KEY = "cidade-builder-placements-v2";
const CityBuilderScene = lazy(() =>
  import("./components/CityBuilderScene").then((module) => ({
    default: module.CityBuilderScene,
  })),
);

const BUILDING_CATALOG: Record<
  BuildType,
  {
    label: string;
    description: string;
    cost: number;
    income: number;
    energy: number;
    population: number;
  }
> = {
  house: {
    label: "Casa",
    description: "Expande bairros e aumenta a populacao trabalhadora.",
    cost: 80,
    income: 12,
    energy: -2,
    population: 6,
  },
  road: {
    label: "Estrada",
    description: "Liga setores e melhora o fluxo entre os lotes.",
    cost: 25,
    income: 0,
    energy: 0,
    population: 0,
  },
  factory: {
    label: "Fabrica",
    description: "Produz recursos e puxa a economia da cidade moderna.",
    cost: 160,
    income: 36,
    energy: -8,
    population: 0,
  },
  townCenter: {
    label: "Town Center",
    description: "Centro principal do assentamento fantasy RTS.",
    cost: 220,
    income: 24,
    energy: -3,
    population: 12,
  },
  market: {
    label: "Mercado",
    description: "Cria comercio local e aumenta a circulacao de ouro.",
    cost: 150,
    income: 22,
    energy: -1,
    population: 2,
  },
  barracks: {
    label: "Quartel",
    description: "Estrutura militar para o lado RTS da cidade.",
    cost: 180,
    income: 8,
    energy: -4,
    population: 3,
  },
  watchTower: {
    label: "Torre",
    description: "Ponto de vigia que marca fronteiras e acesso.",
    cost: 130,
    income: 4,
    energy: -2,
    population: 1,
  },
  windmill: {
    label: "Moinho",
    description: "Destaque rural que ajuda a sustentar o distrito.",
    cost: 140,
    income: 10,
    energy: 4,
    population: 2,
  },
  temple: {
    label: "Templo",
    description: "Edificio simbolico para a camada fantasy do mapa.",
    cost: 170,
    income: 7,
    energy: -1,
    population: 4,
  },
  farm: {
    label: "Fazenda",
    description: "Area produtiva para abrir o mapa e variar os distritos.",
    cost: 90,
    income: 8,
    energy: 1,
    population: 2,
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

function loadSavedPlacements() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const rawValue = window.localStorage.getItem(STORAGE_KEY);
    if (!rawValue) {
      return [];
    }

    const parsed = JSON.parse(rawValue) as BuildingPlacement[];
    return parsed.filter(
      (placement) =>
        placement.x >= 0 &&
        placement.x < GRID_SIZE &&
        placement.z >= 0 &&
        placement.z < GRID_SIZE &&
        !isReservedCell(placement.x, placement.z),
    );
  } catch {
    return [];
  }
}

function App() {
  const [selectedTool, setSelectedTool] = useState<BuildType>("house");
  const [placements, setPlacements] = useState<BuildingPlacement[]>(loadSavedPlacements);
  const [lastAction, setLastAction] = useState(
    "Escolha uma construcao no painel e clique no grid para expandir o mapa.",
  );

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(placements));
  }, [placements]);

  const resources = useMemo(() => {
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
    const totalTreasury = placements.reduce(
      (sum, placement) => sum + BUILDING_CATALOG[placement.type].income,
      1200,
    );
    const totalEnergy = placements.reduce(
      (sum, placement) => sum + BUILDING_CATALOG[placement.type].energy,
      90,
    );
    const rtsStructures =
      counts.townCenter +
      counts.market +
      counts.barracks +
      counts.watchTower +
      counts.windmill +
      counts.temple +
      counts.farm;

    return {
      counts,
      freeLots,
      occupancy: Math.round((occupiedCells / totalCells) * 100),
      totalPopulation,
      totalTreasury,
      totalEnergy,
      rtsStructures,
      totalBuildings: occupiedCells,
    };
  }, [placements]);

  const selectedCard = BUILDING_CATALOG[selectedTool];

  const handlePlaceBuilding = (x: number, z: number) => {
    if (isReservedCell(x, z)) {
      setLastAction("Esse lote ja esta ocupado pela infraestrutura do mapa.");
      return;
    }

    setPlacements((currentPlacements) => {
      const existingPlacement = currentPlacements.find(
        (placement) => placement.x === x && placement.z === z,
      );

      if (existingPlacement?.type === selectedTool) {
        setLastAction(
          `${selectedCard.label} ja esta nesse lote ${x + 1}:${z + 1}. Escolha outro.`,
        );
        return currentPlacements;
      }

      const nextPlacement = { x, z, type: selectedTool };
      const withoutCurrentCell = currentPlacements.filter(
        (placement) => placement.x !== x || placement.z !== z,
      );

      setLastAction(
        `${selectedCard.label} colocada no lote ${x + 1}:${z + 1}. Vista liberada e area expandida.`,
      );

      return [...withoutCurrentCell, nextPlacement];
    });
  };

  const handleResetMap = () => {
    setPlacements([]);
    setLastAction("As construcoes do jogador foram limpas e o terreno voltou ao estado inicial.");
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Planejamento Urbano e RTS</p>
          <h1>Nova Aurora</h1>
          <p className="intro">
            Mapa 3D aberto com construcao de cidade moderna e opcoes fantasy RTS no mesmo grid.
          </p>
        </div>
        <div className="summary-chip">
          <span>Visao geral</span>
          <strong>{resources.occupancy}% do grid ocupado</strong>
        </div>
      </header>

      <main className="app-layout">
        <section className="scene-panel">
          <div className="scene-panel__bar">
            <div>
              <h2>Mapa 3D</h2>
              <p>Arraste para girar, use scroll para zoom e clique no grid para construir.</p>
            </div>
            <span className="scene-tag">Grid {GRID_SIZE} x {GRID_SIZE}</span>
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
            />
          </Suspense>
        </section>

        <aside className="sidebar">
          <section className="sidebar-card">
            <div className="sidebar-card__header">
              <h2>Ferramentas</h2>
              <button type="button" className="ghost-button" onClick={handleResetMap}>
                Limpar mapa
              </button>
            </div>

            <div className="tool-grid">
              {TOOL_ORDER.map((tool) => {
                const item = BUILDING_CATALOG[tool];
                return (
                  <button
                    key={tool}
                    type="button"
                    className={`tool-button${selectedTool === tool ? " is-active" : ""}`}
                    onClick={() => setSelectedTool(tool)}
                  >
                    <span>{item.label}</span>
                    <small>Custo {item.cost}</small>
                  </button>
                );
              })}
            </div>

            <div className="selection-card">
              <h3>{selectedCard.label}</h3>
              <p>{selectedCard.description}</p>
              <dl className="selection-stats">
                <div>
                  <dt>Custo</dt>
                  <dd>{selectedCard.cost}</dd>
                </div>
                <div>
                  <dt>Receita</dt>
                  <dd>{selectedCard.income >= 0 ? `+${selectedCard.income}` : selectedCard.income}</dd>
                </div>
                <div>
                  <dt>Energia</dt>
                  <dd>{selectedCard.energy}</dd>
                </div>
                <div>
                  <dt>Populacao</dt>
                  <dd>{selectedCard.population}</dd>
                </div>
              </dl>
            </div>
          </section>

          <section className="sidebar-card">
            <h2>Recursos da cidade</h2>
            <div className="resource-grid">
              <article>
                <span>Casas</span>
                <strong>{resources.counts.house}</strong>
              </article>
              <article>
                <span>Estradas</span>
                <strong>{resources.counts.road}</strong>
              </article>
              <article>
                <span>Fabricas</span>
                <strong>{resources.counts.factory}</strong>
              </article>
              <article>
                <span>Estruturas RTS</span>
                <strong>{resources.rtsStructures}</strong>
              </article>
              <article>
                <span>Terreno livre</span>
                <strong>{resources.freeLots}</strong>
              </article>
              <article>
                <span>Populacao</span>
                <strong>{resources.totalPopulation}</strong>
              </article>
              <article>
                <span>Tesouro</span>
                <strong>{resources.totalTreasury}</strong>
              </article>
              <article>
                <span>Energia</span>
                <strong>{resources.totalEnergy}</strong>
              </article>
            </div>
          </section>

          <section className="sidebar-card">
            <h2>Status</h2>
            <p className="status-copy">{lastAction}</p>
            <p className="status-note">
              As construcoes ficam salvas no navegador e agora incluem as pecas urbanas e as
              estruturas do pack fantasy RTS.
            </p>
          </section>
        </aside>
      </main>
    </div>
  );
}

export default App;
