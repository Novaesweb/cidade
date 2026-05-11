import { Clone, useFBX } from "@react-three/drei";
import { useEffect } from "react";
import type { Object3D } from "three";
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

type ScenePropConfig = {
  x: number;
  z: number;
  rotationY?: number;
};

type PropClusterProps = {
  items: ScenePropConfig[];
  objectUrl: string;
  scale: number;
  y?: number;
};

function useShadowReadyModel(objectUrl: string) {
  const object = useFBX(objectUrl) as Object3D;

  useEffect(() => {
    object.traverse((child) => {
      const meshLike = child as Object3D & {
        isMesh?: boolean;
        castShadow?: boolean;
        receiveShadow?: boolean;
      };

      if (meshLike.isMesh) {
        meshLike.castShadow = true;
        meshLike.receiveShadow = true;
      }
    });
  }, [object]);

  return object;
}

function PropCluster({ items, objectUrl, scale, y = 0 }: PropClusterProps) {
  const object = useShadowReadyModel(objectUrl);

  return (
    <>
      {items.map((item) => (
        <group
          key={`${objectUrl}-${item.x}-${item.z}`}
          position={[toWorld(item.x), y, toWorld(item.z)]}
          rotation={[0, item.rotationY ?? 0, 0]}
          scale={scale}
        >
          <Clone object={object} />
        </group>
      ))}
    </>
  );
}

export function ImportedCityProps() {
  return (
    <>
      <PropCluster items={TREES} objectUrl="/city-props/Tree__Tree.fbx" scale={0.75} />
      <PropCluster
        items={LAMP_POSTS}
        objectUrl="/city-props/StreetLight__StreetLight.fbx"
        scale={0.72}
      />
      <PropCluster items={BENCHES} objectUrl="/city-props/Bench__Bench.fbx" scale={0.82} />
      <PropCluster
        items={BIKE_RACKS}
        objectUrl="/city-props/BikeRack__BikeRack.fbx"
        scale={0.82}
      />
      <PropCluster
        items={TRASH_CANS}
        objectUrl="/city-props/TrashCan__TrashCan.fbx"
        scale={0.78}
      />
      <PropCluster
        items={STOP_SIGNS}
        objectUrl="/city-props/StopSign__StopSign.fbx"
        scale={0.78}
      />
      <PropCluster
        items={FIRE_HYDRANTS}
        objectUrl="/city-props/FireHydrant__FireHydrant.fbx"
        scale={0.8}
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
