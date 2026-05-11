import { Clone, useFBX } from "@react-three/drei";
import { useMemo } from "react";
import { Box3, Group, type Object3D, Vector3 } from "three";

type NormalizedFbxInstanceProps = {
  objectUrl: string;
  position: [number, number, number];
  targetHeight: number;
  rotation?: [number, number, number];
};

function useNormalizedModel(objectUrl: string, targetHeight: number) {
  const object = useFBX(objectUrl) as Object3D;

  return useMemo(() => {
    const clone = object.clone(true);
    clone.updateMatrixWorld(true);

    const bounds = new Box3().setFromObject(clone);
    const size = new Vector3();
    const center = new Vector3();
    bounds.getSize(size);
    bounds.getCenter(center);

    const wrapper = new Group();
    const normalized = clone.clone(true);
    const scale = targetHeight / Math.max(size.y, 0.001);

    normalized.position.set(-center.x, -bounds.min.y, -center.z);
    normalized.scale.setScalar(scale);
    normalized.traverse((child) => {
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

    wrapper.add(normalized);
    return wrapper;
  }, [object, targetHeight]);
}

export function NormalizedFbxInstance({
  objectUrl,
  position,
  targetHeight,
  rotation = [0, 0, 0],
}: NormalizedFbxInstanceProps) {
  const object = useNormalizedModel(objectUrl, targetHeight);

  return (
    <group position={position} rotation={rotation}>
      <Clone object={object} />
    </group>
  );
}
