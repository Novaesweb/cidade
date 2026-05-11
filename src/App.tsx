import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import {
  GRID_SIZE,
  RESERVED_CELL_COUNT,
  isReservedCell,
  type BuildType,
  type BuildingPlacement,
} from "./components/cityBuilderConfig";
import "./App.css";

const STORAGE_KEY = "cidade-builder-placements-v1";
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
    description: "Expande bairros e aumenta a população trabalhadora.",
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
    label: "Fábrica",
    description: "Produz recursos e impulsiona a economia da cidade.",
    cost: 160,
    income: 36,
    energy: -8,
    population: 0,
  },
};

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
    "Escolha uma peça no painel e clique no grid para expandir sua cidade.",
  );

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(placements));
  }, [placements]);

  const resources = useMemo(() => {
    const houses = placements.filter((placement) => placement.type === "house").length;
    const roads = placements.filter((placement) => placement.type === "road").length;
    const factories = placements.filter((placement) => placement.type === "factory").length;
    const totalCells = GRID_SIZE * GRID_SIZE - RESERVED_CELL_COUNT;
    const occupiedCells = placements.length;
    const freeLots = totalCells - occupiedCells;

    return {
      houses,
      roads,
      factories,
      population: houses * BUILDING_CATALOG.house.population,
      treasury:
        1200 +
        houses * BUILDING_CATALOG.house.income +
        factories * BUILDING_CATALOG.factory.income,
      energy:
        90 +
        houses * BUILDING_CATALOG.house.energy +
        factories * BUILDING_CATALOG.factory.energy,
      freeLots,
      occupancy: Math.round((occupiedCells / totalCells) * 100),
    };
  }, [placements]);

  const selectedCard = BUILDING_CATALOG[selectedTool];

  const handlePlaceBuilding = (x: number, z: number) => {
    if (isReservedCell(x, z)) {
      setLastAction("Esse lote já faz parte da infraestrutura inicial do mapa.");
      return;
    }

    setPlacements((currentPlacements) => {
      const existingPlacement = currentPlacements.find(
        (placement) => placement.x === x && placement.z === z,
      );

      if (existingPlacement?.type === selectedTool) {
        setLastAction(
          `${selectedCard.label} já posicionada em ${x + 1}:${z + 1}. Escolha outro lote.`,
        );
        return currentPlacements;
      }

      const nextPlacement = { x, z, type: selectedTool };
      const withoutCurrentCell = currentPlacements.filter(
        (placement) => placement.x !== x || placement.z !== z,
      );

      setLastAction(
        `${selectedCard.label} colocada no lote ${x + 1}:${z + 1}. Setor pronto para crescer.`,
      );

      return [...withoutCurrentCell, nextPlacement];
    });
  };

  const handleResetMap = () => {
    setPlacements([]);
    setLastAction("As construções do jogador foram removidas. O terreno voltou a ficar livre.");
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Planejamento Urbano</p>
          <h1>Nova Aurora</h1>
          <p className="intro">
            Um protótipo leve de city builder com mapa low poly, grid de construção e
            persistência local.
          </p>
        </div>
        <div className="summary-chip">
          <span>Ocupação atual</span>
          <strong>{resources.occupancy}% do grid</strong>
        </div>
      </header>

      <main className="app-layout">
        <section className="scene-panel">
          <div className="scene-panel__bar">
            <div>
              <h2>Mapa 3D</h2>
              <p>Arraste para girar, use o scroll para zoom e clique nos lotes para construir.</p>
            </div>
            <span className="scene-tag">Grid {GRID_SIZE} x {GRID_SIZE}</span>
          </div>

          <Suspense
            fallback={
              <div className="scene-fallback">
                <strong>Preparando o mapa 3D...</strong>
                <span>Carregando terreno, grid e ferramentas de construção.</span>
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
              {(Object.keys(BUILDING_CATALOG) as BuildType[]).map((tool) => {
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
                  <dt>População</dt>
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
                <strong>{resources.houses}</strong>
              </article>
              <article>
                <span>Estradas</span>
                <strong>{resources.roads}</strong>
              </article>
              <article>
                <span>Fábricas</span>
                <strong>{resources.factories}</strong>
              </article>
              <article>
                <span>Terreno livre</span>
                <strong>{resources.freeLots}</strong>
              </article>
              <article>
                <span>População</span>
                <strong>{resources.population}</strong>
              </article>
              <article>
                <span>Tesouro</span>
                <strong>{resources.treasury}</strong>
              </article>
              <article>
                <span>Energia</span>
                <strong>{resources.energy}</strong>
              </article>
              <article>
                <span>Construções</span>
                <strong>{placements.length}</strong>
              </article>
            </div>
          </section>

          <section className="sidebar-card">
            <h2>Status</h2>
            <p className="status-copy">{lastAction}</p>
            <p className="status-note">
              As construções do jogador ficam salvas no navegador enquanto este dispositivo
              continuar usando este projeto.
            </p>
          </section>
        </aside>
      </main>
    </div>
  );
}

export default App;
