import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { useMemo } from "react";
import { FantasyBuildModel } from "./FantasyBuildModels";
import {
  BUILD_AREA_SIZE,
  CELL_SIZE,
  FIXED_HOUSES,
  FIXED_ROADS,
  GRID_SIZE,
  HALF_GRID,
  toWorld,
  type BuildType,
  type BuildingPlacement,
} from "./cityBuilderConfig";
import { ImportedCityProps } from "./ImportedCityProps";

type ViewMode = "survey" | "build";
type InteractionMode = "build" | "erase";
type HoveredCell = { x: number; z: number };

type CityBuilderSceneProps = {
  placements: BuildingPlacement[];
  selectedTool: BuildType;
  onPlaceBuilding: (x: number, z: number) => void;
  hoveredCell: HoveredCell | null;
  onHoverCellChange: (cell: HoveredCell | null) => void;
  showDecorations: boolean;
  showGrid: boolean;
  viewMode: ViewMode;
  interactionMode: InteractionMode;
  canPlaceSelected: boolean;
  hoverCanBuild: boolean;
  hoverHasPlacement: boolean;
  hoverIsReserved: boolean;
  hoverRoadAccess: boolean;
  requiresRoadAccessSelected: boolean;
};

function RoadTile({ x, z }: { x: number; z: number }) {
  return (
    <group position={[toWorld(x), 0.03, toWorld(z)]}>
      <mesh receiveShadow>
        <boxGeometry args={[CELL_SIZE * 0.96, 0.08, CELL_SIZE * 0.96]} />
        <meshStandardMaterial color="#475569" roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.05, 0]}>
        <boxGeometry args={[CELL_SIZE * 0.16, 0.01, CELL_SIZE * 0.76]} />
        <meshStandardMaterial color="#f8fafc" emissive="#f8fafc" emissiveIntensity={0.15} />
      </mesh>
    </group>
  );
}

function HouseModel({
  position,
  tint = "#f97316",
}: {
  position: [number, number, number];
  tint?: string;
}) {
  return (
    <group position={position}>
      <mesh castShadow receiveShadow position={[0, 0.55, 0]}>
        <boxGeometry args={[1.15, 1.1, 1.15]} />
        <meshStandardMaterial color={tint} roughness={0.9} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 1.3, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[0.95, 0.8, 4]} />
        <meshStandardMaterial color="#7c2d12" roughness={0.8} />
      </mesh>
      <mesh castShadow position={[0.28, 0.45, 0.58]}>
        <boxGeometry args={[0.18, 0.38, 0.08]} />
        <meshStandardMaterial color="#f8fafc" />
      </mesh>
    </group>
  );
}

function FactoryModel({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh castShadow receiveShadow position={[0, 0.52, 0]}>
        <boxGeometry args={[1.45, 1.05, 1.2]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.95} />
      </mesh>
      <mesh castShadow receiveShadow position={[0.3, 1.18, -0.15]}>
        <boxGeometry args={[0.55, 0.35, 0.65]} />
        <meshStandardMaterial color="#94a3b8" roughness={0.85} />
      </mesh>
      <mesh castShadow receiveShadow position={[-0.46, 1.2, 0.26]}>
        <cylinderGeometry args={[0.16, 0.2, 1.55, 8]} />
        <meshStandardMaterial color="#64748b" roughness={0.7} />
      </mesh>
      <mesh castShadow receiveShadow position={[-0.46, 2.02, 0.26]}>
        <coneGeometry args={[0.14, 0.24, 8]} />
        <meshStandardMaterial color="#f59e0b" emissive="#f97316" emissiveIntensity={0.4} />
      </mesh>
    </group>
  );
}

function Terrain() {
  return (
    <>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
        <planeGeometry args={[BUILD_AREA_SIZE + 16, BUILD_AREA_SIZE + 16]} />
        <meshStandardMaterial color="#365314" roughness={1} />
      </mesh>

      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <planeGeometry args={[BUILD_AREA_SIZE + 5, BUILD_AREA_SIZE + 5]} />
        <meshStandardMaterial color="#4d7c0f" roughness={1} />
      </mesh>

      <mesh receiveShadow rotation={[-Math.PI / 2, 0.15, 0]} position={[-8, -0.01, -7]}>
        <planeGeometry args={[10, 7]} />
        <meshStandardMaterial color="#7c5a36" roughness={1} />
      </mesh>

      <mesh receiveShadow rotation={[-Math.PI / 2, -0.3, 0]} position={[9, -0.01, 8]}>
        <planeGeometry args={[8, 5]} />
        <meshStandardMaterial color="#8b6b45" roughness={1} />
      </mesh>

      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[BUILD_AREA_SIZE, BUILD_AREA_SIZE]} />
        <meshStandardMaterial color="#5f7c34" roughness={0.98} />
      </mesh>
    </>
  );
}

type BuildSurfaceProps = {
  hoveredCell: HoveredCell | null;
  onHoverChange: (cell: HoveredCell | null) => void;
  onPlaceBuilding: (x: number, z: number) => void;
  selectedTool: BuildType;
  showGrid: boolean;
  interactionMode: InteractionMode;
  occupiedCellKeys: Set<string>;
  canPlaceSelected: boolean;
  hoverCanBuild: boolean;
  hoverHasPlacement: boolean;
  hoverIsReserved: boolean;
  hoverRoadAccess: boolean;
  requiresRoadAccessSelected: boolean;
};

function BuildSurface({
  hoveredCell,
  onHoverChange,
  onPlaceBuilding,
  selectedTool,
  showGrid,
  interactionMode,
  occupiedCellKeys,
  canPlaceSelected,
  hoverCanBuild,
  hoverHasPlacement,
  hoverIsReserved,
  hoverRoadAccess,
  requiresRoadAccessSelected,
}: BuildSurfaceProps) {
  const handlePointerMove = (event: ThreeEvent<PointerEvent>) => {
    const x = Math.floor((event.point.x + HALF_GRID) / CELL_SIZE);
    const z = Math.floor((event.point.z + HALF_GRID) / CELL_SIZE);

    if (x < 0 || x >= GRID_SIZE || z < 0 || z >= GRID_SIZE) {
      onHoverChange(null);
      return;
    }

    onHoverChange({ x, z });
  };

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    const x = Math.floor((event.point.x + HALF_GRID) / CELL_SIZE);
    const z = Math.floor((event.point.z + HALF_GRID) / CELL_SIZE);

    if (x < 0 || x >= GRID_SIZE || z < 0 || z >= GRID_SIZE) {
      return;
    }

    onPlaceBuilding(x, z);
  };

  const hoveredKey = hoveredCell ? `${hoveredCell.x}:${hoveredCell.z}` : null;
  const hasUserBuilding = hoveredKey ? occupiedCellKeys.has(hoveredKey) : hoverHasPlacement;
  const showReservedState =
    Boolean(hoveredCell) && hoverIsReserved && interactionMode === "build";
  const hoverColor =
    showReservedState
      ? "#64748b"
      : interactionMode === "erase"
      ? hasUserBuilding
        ? "#f87171"
        : "#94a3b8"
      : requiresRoadAccessSelected && hoveredCell && !hoverRoadAccess
        ? "#f59e0b"
      : !canPlaceSelected
        ? "#f87171"
        : hoveredCell && !hoverCanBuild
          ? "#fca5a5"
        : selectedTool === "house"
          ? "#fb923c"
          : selectedTool === "road"
            ? "#cbd5e1"
            : "#93c5fd";
  const hoverOpacity =
    showReservedState
      ? 0.35
      : interactionMode === "erase" && !hasUserBuilding
        ? 0.22
        : hoveredCell && !hoverCanBuild
          ? 0.32
          : !canPlaceSelected
            ? 0.28
            : 0.45;

  return (
    <>
      {showGrid && (
        <gridHelper
          args={[BUILD_AREA_SIZE, GRID_SIZE, "#1e293b", "#3f6212"]}
          position={[0, 0.02, 0]}
        />
      )}

      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.05, 0]}
        onPointerMove={handlePointerMove}
        onPointerOut={() => onHoverChange(null)}
        onClick={handleClick}
      >
        <planeGeometry args={[BUILD_AREA_SIZE, BUILD_AREA_SIZE]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      {hoveredCell && (
        <mesh position={[toWorld(hoveredCell.x), 0.08, toWorld(hoveredCell.z)]}>
          <boxGeometry args={[CELL_SIZE * 0.94, 0.06, CELL_SIZE * 0.94]} />
          <meshStandardMaterial color={hoverColor} transparent opacity={hoverOpacity} />
        </mesh>
      )}
    </>
  );
}

function PlacedBuilding({ placement }: { placement: BuildingPlacement }) {
  const position: [number, number, number] = [toWorld(placement.x), 0, toWorld(placement.z)];

  if (placement.type === "road") {
    return <RoadTile x={placement.x} z={placement.z} />;
  }

  if (placement.type === "factory") {
    return <FactoryModel position={position} />;
  }

  if (placement.type !== "house") {
    return <FantasyBuildModel type={placement.type} position={position} />;
  }

  return <HouseModel position={position} tint="#f59e0b" />;
}

function SceneWorld({
  placements,
  selectedTool,
  onPlaceBuilding,
  hoveredCell,
  onHoverCellChange,
  showDecorations,
  showGrid,
  viewMode,
  interactionMode,
  canPlaceSelected,
  hoverCanBuild,
  hoverHasPlacement,
  hoverIsReserved,
  hoverRoadAccess,
  requiresRoadAccessSelected,
}: CityBuilderSceneProps) {
  const roadTiles = useMemo(
    () =>
      FIXED_ROADS.map((road) => (
        <RoadTile key={`road-${road.x}-${road.z}`} x={road.x} z={road.z} />
      )),
    [],
  );

  const occupiedCellKeys = useMemo(
    () => new Set(placements.map((placement) => `${placement.x}:${placement.z}`)),
    [placements],
  );

  const cameraConfig =
    viewMode === "survey"
      ? {
          position: [0, 50, 34] as [number, number, number],
          fov: 30,
          minDistance: 32,
          maxDistance: 92,
          minPolarAngle: 0.34,
          maxPolarAngle: 0.9,
          target: [0, 0, 0] as [number, number, number],
        }
      : {
          position: [12, 26, 18] as [number, number, number],
          fov: 38,
          minDistance: 18,
          maxDistance: 58,
          minPolarAngle: 0.55,
          maxPolarAngle: 1.15,
          target: [2, 0, 2] as [number, number, number],
        };

  return (
    <>
      <color attach="background" args={["#8ec5ff"]} />
      <fog attach="fog" args={["#8ec5ff", 40, 82]} />
      <ambientLight intensity={1.2} />
      <hemisphereLight intensity={0.75} groundColor="#365314" color="#fef3c7" />
      <directionalLight
        castShadow
        intensity={1.8}
        position={[18, 24, 12]}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-24}
        shadow-camera-right={24}
        shadow-camera-top={24}
        shadow-camera-bottom={-24}
      />

      <PerspectiveCamera
        key={`camera-${viewMode}`}
        makeDefault
        position={cameraConfig.position}
        fov={cameraConfig.fov}
      />
      <OrbitControls
        key={`controls-${viewMode}`}
        enablePan
        enableDamping
        dampingFactor={0.08}
        minDistance={cameraConfig.minDistance}
        maxDistance={cameraConfig.maxDistance}
        minPolarAngle={cameraConfig.minPolarAngle}
        maxPolarAngle={cameraConfig.maxPolarAngle}
        rotateSpeed={0.75}
        zoomSpeed={0.8}
        target={cameraConfig.target}
      />

      <Terrain />
      {roadTiles}

      {showDecorations &&
        FIXED_HOUSES.map((house) => (
          <HouseModel
            key={`fixed-house-${house.x}-${house.z}`}
            position={[toWorld(house.x), 0, toWorld(house.z)]}
            tint={house.tint}
          />
        ))}

      {showDecorations && <ImportedCityProps />}
      <FactoryModel position={[toWorld(1), 0, toWorld(5)]} />

      {placements.map((placement) => (
        <PlacedBuilding
          key={`${placement.type}-${placement.x}-${placement.z}`}
          placement={placement}
        />
      ))}

      <BuildSurface
        hoveredCell={hoveredCell}
        onHoverChange={onHoverCellChange}
        onPlaceBuilding={onPlaceBuilding}
        selectedTool={selectedTool}
        showGrid={showGrid}
        interactionMode={interactionMode}
        occupiedCellKeys={occupiedCellKeys}
        canPlaceSelected={canPlaceSelected}
        hoverCanBuild={hoverCanBuild}
        hoverHasPlacement={hoverHasPlacement}
        hoverIsReserved={hoverIsReserved}
        hoverRoadAccess={hoverRoadAccess}
        requiresRoadAccessSelected={requiresRoadAccessSelected}
      />
    </>
  );
}

export function CityBuilderScene(props: CityBuilderSceneProps) {
  return (
    <div className="scene-shell">
      <Canvas shadows dpr={[1, 1.5]} gl={{ antialias: true }}>
        <SceneWorld {...props} />
      </Canvas>
    </div>
  );
}
