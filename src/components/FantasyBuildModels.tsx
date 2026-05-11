import { useFBX } from "@react-three/drei";
import { NormalizedFbxInstance } from "./NormalizedFbxInstance";
import type { BuildType } from "./cityBuilderConfig";

type FantasyBuildModelProps = {
  type: BuildType;
  position: [number, number, number];
};

const FANTASY_MODEL_CONFIG: Partial<
  Record<
    BuildType,
    {
      objectUrl: string;
      targetHeight: number;
    }
  >
> = {
  townCenter: {
    objectUrl: "/fantasy-rts/TownCenter__TownCenter_FirstAge_Level1.fbx",
    targetHeight: 1.8,
  },
  market: {
    objectUrl: "/fantasy-rts/MarketStalls__Market_FirstAge_Level1.fbx",
    targetHeight: 1.6,
  },
  barracks: {
    objectUrl: "/fantasy-rts/Barracks__Barracks_FirstAge_Level1.fbx",
    targetHeight: 1.35,
  },
  watchTower: {
    objectUrl: "/fantasy-rts/SmallWatchTower__WatchTower_FirstAge_Level1.fbx",
    targetHeight: 1.9,
  },
  windmill: {
    objectUrl: "/fantasy-rts/Windmill__Windmill_FirstAge.fbx",
    targetHeight: 2.05,
  },
  temple: {
    objectUrl: "/fantasy-rts/Temple-nR264crTSr__Temple_FirstAge_Level1.fbx",
    targetHeight: 1.7,
  },
  farm: {
    objectUrl: "/fantasy-rts/SmallFarm__Farm_SecondAge_Level1.fbx",
    targetHeight: 1.05,
  },
};

export function FantasyBuildModel({ type, position }: FantasyBuildModelProps) {
  const config = FANTASY_MODEL_CONFIG[type];

  if (!config) {
    return null;
  }

  return (
    <NormalizedFbxInstance
      objectUrl={config.objectUrl}
      position={position}
      targetHeight={config.targetHeight}
    />
  );
}

useFBX.preload("/fantasy-rts/TownCenter__TownCenter_FirstAge_Level1.fbx");
useFBX.preload("/fantasy-rts/MarketStalls__Market_FirstAge_Level1.fbx");
useFBX.preload("/fantasy-rts/Barracks__Barracks_FirstAge_Level1.fbx");
useFBX.preload("/fantasy-rts/SmallWatchTower__WatchTower_FirstAge_Level1.fbx");
useFBX.preload("/fantasy-rts/Windmill__Windmill_FirstAge.fbx");
useFBX.preload("/fantasy-rts/Temple-nR264crTSr__Temple_FirstAge_Level1.fbx");
useFBX.preload("/fantasy-rts/SmallFarm__Farm_SecondAge_Level1.fbx");
