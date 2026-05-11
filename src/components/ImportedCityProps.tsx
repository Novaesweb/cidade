import { useFBX } from "@react-three/drei";
import {
  BENCHES,
  BIKE_RACKS,
  FIRE_HYDRANTS,
  LAMP_POSTS,
  STOP_SIGNS,
  TREES,
  TRASH_CANS,
  toWorld,
} from "./cityBuilderConfig";
import { NormalizedFbxInstance } from "./NormalizedFbxInstance";

type ScenePropConfig = {
  x: number;
  z: number;
  rotationY?: number;
};

type PropClusterProps = {
  items: ScenePropConfig[];
  objectUrl: string;
  targetHeight: number;
  y?: number;
};

function PropCluster({ items, objectUrl, targetHeight, y = 0 }: PropClusterProps) {
  return (
    <>
      {items.map((item) => (
        <NormalizedFbxInstance
          key={`${objectUrl}-${item.x}-${item.z}`}
          objectUrl={objectUrl}
          position={[toWorld(item.x), y, toWorld(item.z)]}
          rotation={[0, item.rotationY ?? 0, 0]}
          targetHeight={targetHeight}
        />
      ))}
    </>
  );
}

export function ImportedCityProps() {
  return (
    <>
      <PropCluster items={TREES} objectUrl="/city-props/Tree__Tree.fbx" targetHeight={2.8} />
      <PropCluster
        items={LAMP_POSTS}
        objectUrl="/city-props/StreetLight__StreetLight.fbx"
        targetHeight={2.4}
      />
      <PropCluster items={BENCHES} objectUrl="/city-props/Bench__Bench.fbx" targetHeight={0.6} />
      <PropCluster
        items={BIKE_RACKS}
        objectUrl="/city-props/BikeRack__BikeRack.fbx"
        targetHeight={0.7}
      />
      <PropCluster
        items={TRASH_CANS}
        objectUrl="/city-props/TrashCan__TrashCan.fbx"
        targetHeight={0.7}
      />
      <PropCluster
        items={STOP_SIGNS}
        objectUrl="/city-props/StopSign__StopSign.fbx"
        targetHeight={1.3}
      />
      <PropCluster
        items={FIRE_HYDRANTS}
        objectUrl="/city-props/FireHydrant__FireHydrant.fbx"
        targetHeight={0.75}
      />
    </>
  );
}

useFBX.preload("/city-props/Tree__Tree.fbx");
useFBX.preload("/city-props/StreetLight__StreetLight.fbx");
useFBX.preload("/city-props/Bench__Bench.fbx");
useFBX.preload("/city-props/BikeRack__BikeRack.fbx");
useFBX.preload("/city-props/TrashCan__TrashCan.fbx");
useFBX.preload("/city-props/StopSign__StopSign.fbx");
useFBX.preload("/city-props/FireHydrant__FireHydrant.fbx");
