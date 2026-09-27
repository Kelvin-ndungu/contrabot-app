import React, { Suspense, useState, useEffect, useRef, useMemo, Component } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF, OrbitControls, Html, Line } from "@react-three/drei";
import { SkeletonUtils } from "three-stdlib";
import { X, RotateCw, ZoomIn, ZoomOut, RotateCcw, Info, Shield, Check, Eye, MessageCircle, Send, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { postChat } from "@/api/client";
import * as THREE from "three";

// -------------------------------------------------------------
// WebGL Availability Check
// -------------------------------------------------------------
function isWebGLAvailable() {
  try {
    const canvas = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext("webgl") || canvas.getContext("experimental-webgl"))
    );
  } catch (e) {
    return false;
  }
}

/** Catch 3D failures inside the overlay and fall back to the step-by-step text explainer */
class Vis3DErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error) {
    console.warn("BodyVisualization 3D failed:", error);
  }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

// -------------------------------------------------------------
// Redesigned Stylized Body Silhouette (From Primitives)
// -------------------------------------------------------------
function BodySilhouetteMesh({ isMobile, onPartHover, activeMethod }) {
  const groupRef = useRef();

  useFrame((state) => {
    if (groupRef.current) {
      // Slow rotation for visual interest
      groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.08) * 0.02;
    }
  });

  const position = isMobile ? [0, -0.4, 0] : [0.4, -0.2, 0];
  const scale = isMobile ? 0.75 : 1.0;

  // Hover handlers
  const handleOver = (e, partName, desc) => {
    e.stopPropagation();
    document.body.style.cursor = "pointer";
    onPartHover({
      title: partName,
      desc: desc,
      x: e.clientX,
      y: e.clientY
    });
  };

  const handleOut = () => {
    document.body.style.cursor = "default";
    onPartHover(null);
  };

  // Tooltip descriptions based on active method
  const getDesc = (part) => {
    if (part === "head") {
      return "Hypothalamus: Oral hormones signal the brain to pause egg maturation and prevent ovulation.";
    }
    if (part === "arm") {
      return "Upper Arm: Site of subdermal implants or injections which release hormones continuously.";
    }
    if (part === "pelvis") {
      return "Pelvis: Holds the reproductive system. The site of uterus/ovary protection by barrier or hormonal actions.";
    }
    return "";
  };

  return (
    <group ref={groupRef} position={position} scale={scale}>
      {/* Head: Sphere r=0.18 */}
      <mesh 
        position={[0, 0.58, 0]}
        onPointerOver={(e) => handleOver(e, "Brain (Hypothalamus)", getDesc("head"))}
        onPointerOut={handleOut}
      >
        <sphereGeometry args={[0.18, 16, 16]} />
        <meshPhongMaterial
          color={0x1a3a4a}
          transparent
          opacity={0.4}
          emissive={0x0E7A80}
          emissiveIntensity={0.1}
          shininess={50}
        />
      </mesh>

      {/* Torso: Cylinder top=0.28, bottom=0.22, height=0.6 */}
      <mesh 
        position={[0, 0.1, 0]}
        onPointerOver={(e) => handleOver(e, "Torso", "The central pathway for systemic hormone circulation.")}
        onPointerOut={handleOut}
      >
        <cylinderGeometry args={[0.28, 0.22, 0.6, 16]} />
        <meshPhongMaterial
          color={0x1a3a4a}
          transparent
          opacity={0.4}
          emissive={0x0E7A80}
          emissiveIntensity={0.1}
          shininess={50}
        />
      </mesh>

      {/* Pelvis: Sphere r=0.2 flattened on Y */}
      <mesh 
        position={[0, -0.28, 0]} 
        scale={[1.1, 0.7, 0.9]}
        onPointerOver={(e) => handleOver(e, "Reproductive Cavity", getDesc("pelvis"))}
        onPointerOut={handleOut}
      >
        <sphereGeometry args={[0.2, 16, 16]} />
        <meshPhongMaterial
          color={0x1a3a4a}
          transparent
          opacity={0.4}
          emissive={0x0E7A80}
          emissiveIntensity={0.1}
          shininess={50}
        />
      </mesh>

      {/* Left Upper Arm: Cylinder r=0.07 height=0.35, rotated */}
      <mesh 
        position={[-0.36, 0.28, 0]} 
        rotation={[0, 0, Math.PI / 12]}
        onPointerOver={(e) => handleOver(e, "Upper Arm", getDesc("arm"))}
        onPointerOut={handleOut}
      >
        <cylinderGeometry args={[0.07, 0.07, 0.35, 12]} />
        <meshPhongMaterial
          color={0x1a3a4a}
          transparent
          opacity={0.4}
          emissive={0x0E7A80}
          emissiveIntensity={0.1}
          shininess={30}
        />
      </mesh>

      {/* Left Lower Arm: Cylinder r=0.06 height=0.32 */}
      <mesh position={[-0.41, 0.01, 0]} rotation={[0, 0, Math.PI / 16]}>
        <cylinderGeometry args={[0.06, 0.06, 0.32, 12]} />
        <meshPhongMaterial
          color={0x1a3a4a}
          transparent
          opacity={0.4}
          emissive={0x0E7A80}
          emissiveIntensity={0.1}
        />
      </mesh>

      {/* Right Upper Arm: Cylinder r=0.07 height=0.35, rotated */}
      <mesh position={[0.36, 0.28, 0]} rotation={[0, 0, -Math.PI / 12]}>
        <cylinderGeometry args={[0.07, 0.07, 0.35, 12]} />
        <meshPhongMaterial
          color={0x1a3a4a}
          transparent
          opacity={0.4}
          emissive={0x0E7A80}
          emissiveIntensity={0.1}
        />
      </mesh>

      {/* Right Lower Arm */}
      <mesh position={[0.41, 0.01, 0]} rotation={[0, 0, -Math.PI / 16]}>
        <cylinderGeometry args={[0.06, 0.06, 0.32, 12]} />
        <meshPhongMaterial
          color={0x1a3a4a}
          transparent
          opacity={0.4}
          emissive={0x0E7A80}
          emissiveIntensity={0.1}
        />
      </mesh>
    </group>
  );
}

// -------------------------------------------------------------
// Visual overlay scenes
// -------------------------------------------------------------

/** Floating HTML tag with a CSS arrow pointing at a 3D spot */
function SceneTag({ children, position, tone = "teal", side = "right", distanceFactor = 5.5 }) {
  const tones = {
    teal: { badge: "border-[#0E7A80] bg-[#0E7A80] text-white", arrow: "#0E7A80" },
    cream: { badge: "border-[#E8E0D0] bg-[#F5F0E6] text-[#1a2a32]", arrow: "#F5F0E6" },
    purple: { badge: "border-[#5C3C7A] bg-[#5C3C7A] text-white", arrow: "#5C3C7A" },
  };
  const t = tones[tone] || tones.teal;
  const tipStyle =
    side === "left"
      ? { right: "100%", top: "50%", marginTop: -6, borderWidth: "6px 8px 6px 0", borderColor: `transparent ${t.arrow} transparent transparent` }
      : side === "up"
        ? { left: "50%", bottom: "100%", marginLeft: -6, borderWidth: "0 6px 8px 6px", borderColor: `transparent transparent ${t.arrow} transparent` }
        : side === "down"
          ? { left: "50%", top: "100%", marginLeft: -6, borderWidth: "8px 6px 0 6px", borderColor: `${t.arrow} transparent transparent transparent` }
          : { left: "100%", top: "50%", marginTop: -6, borderWidth: "6px 0 6px 8px", borderColor: `transparent transparent transparent ${t.arrow}` };

  return (
    <Html position={position} center distanceFactor={distanceFactor} style={{ pointerEvents: "none" }} zIndexRange={[80, 0]}>
      <div className={`relative whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-bold tracking-wide shadow-lg ${t.badge}`}>
        {children}
        <span className="absolute block h-0 w-0 border-solid" style={tipStyle} aria-hidden />
      </div>
    </Html>
  );
}

/** 3D arrow from a label float-point toward the insertion site */
function InsertionArrow({ from = [0.28, 0.48, 0.38], to = [0.03, 0.2, 0.09], color = "#4DD6DC" }) {
  const dir = useMemo(() => {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const d = b.clone().sub(a);
    const len = d.length() || 1;
    d.normalize();
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    return { quat, mid, len, tip: b };
  }, [from, to]);

  return (
    <group>
      <Line points={[from, to]} color={color} lineWidth={2.5} transparent opacity={0.9} dashed={false} />
      <mesh position={dir.tip.toArray()} quaternion={dir.quat}>
        <coneGeometry args={[0.028, 0.07, 10]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <SceneTag position={[from[0] + 0.02, from[1] + 0.04, from[2]]} tone="purple" side="down" distanceFactor={6}>
        Rod goes here →
      </SceneTag>
    </group>
  );
}

function ImplantRedesignScene({ step, isMobile }) {
  const rodRef = useRef();
  const progress = useRef(0);
  const basePos = isMobile ? [0, -0.4, 0] : [0.4, -0.2, 0];

  useFrame((state, delta) => {
    const cycle = state.clock.elapsedTime % 4;
    let goal = cycle < 1.3 ? (cycle / 1.3) * 2 : cycle < 2.5 ? 2 : cycle < 3.3 ? 2 - ((cycle - 2.5) / 0.8) * 2 : 0;
    if (step >= 2) goal = 2;
    progress.current = THREE.MathUtils.damp(progress.current, goal, 4, delta);
    const t = progress.current / 2;
    if (rodRef.current) {
      // Just above arm → under skin (kept close to the arm surface)
      rodRef.current.position.set(
        THREE.MathUtils.lerp(-0.34, -0.37, t),
        THREE.MathUtils.lerp(0.34, 0.27, t),
        THREE.MathUtils.lerp(0.06, 0.01, t)
      );
    }
  });

  return (
    <group position={basePos}>
      <mesh position={[-0.36, 0.28, 0.02]} rotation={[0, 0, Math.PI / 12]}>
        <capsuleGeometry args={[0.08, 0.35, 4, 8]} />
        <meshStandardMaterial color="#E8C4A8" transparent opacity={0.45} roughness={0.85} />
      </mesh>
      <SceneTag position={[-0.5, 0.22, 0.08]} tone="teal" side="right">
        Your arm
      </SceneTag>
      <mesh ref={rodRef} position={[-0.34, 0.34, 0.06]} rotation={[0, 0, Math.PI / 12]}>
        <cylinderGeometry args={[0.012, 0.012, 0.12, 10]} />
        <meshStandardMaterial color="#F5F0E6" roughness={0.85} metalness={0.05} emissive="#E8E0D0" emissiveIntensity={0.12} />
      </mesh>
      <SceneTag position={[-0.18, 0.4, 0.1]} tone="cream" side="left">
        Implant rod
      </SceneTag>
      <InsertionArrow from={[-0.12, 0.48, 0.18]} to={[-0.35, 0.29, 0.03]} />
    </group>
  );
}

/**
 * Real implant placement: scanned arm + cream rod matching the photo reference.
 * Loops an outside → under-skin insertion so the learner clearly sees the rod go in.
 */
function RealImplantInsertionScene({ step, isMobile, mode = "implant" }) {
  const armGltf = useGLTF("/models/arm.glb");
  const groupRef = useRef();
  const deviceRef = useRef();
  const guideRef = useRef();
  const seatedTagRef = useRef();
  const progress = useRef(0);
  const [ready, setReady] = useState(false);

  const armScene = useMemo(() => {
    const cloned = SkeletonUtils.clone(armGltf.scene);
    cloned.traverse((child) => {
      if (child.isMesh) {
        child.material = child.material.clone();
        child.material.transparent = true;
        // Always ghost enough that a rod under the skin stays visible
        child.material.opacity = step >= 2 ? 0.42 : step >= 1 ? 0.5 : 0.62;
        child.material.depthWrite = false;
        child.material.side = THREE.DoubleSide;
      }
    });
    return cloned;
  }, [armGltf.scene, step]);

  useEffect(() => {
    const box = new THREE.Box3().setFromObject(armScene);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const target = isMobile ? 1.8 : 2.3;
    armScene.scale.setScalar(target / maxDim);
    const center = new THREE.Vector3();
    box.getCenter(center);
    armScene.position.sub(center.multiplyScalar(target / maxDim));
    armScene.rotation.set(0, Math.PI * 0.15, -0.2);
    setReady(true);
  }, [armScene, isMobile]);

  // Keyframes in arm-local space: just above skin → piercing → fully under skin
  const targets = [
    { pos: [0.04, 0.2, 0.12], rot: [0.05, 0.1, Math.PI / 2] },
    { pos: [0.01, 0.16, 0.03], rot: [0.08, 0.15, Math.PI / 2.05] },
    { pos: [-0.02, 0.13, -0.05], rot: [0.05, 0.12, Math.PI / 2.05] },
  ];

  useFrame((state, delta) => {
    // Repeated insertion demo: 0→inside→hold→retract→repeat
    // Step biases the hold: step 2 stays inside longer / less retract
    const cycleLen = step >= 2 ? 5.5 : 4.2;
    const cycle = state.clock.elapsedTime % cycleLen;
    let goal;
    if (step >= 2) {
      // Settled: mostly stay inside, tiny breathe
      goal = 2;
    } else if (cycle < 1.4) {
      goal = (cycle / 1.4) * 2; // insert
    } else if (cycle < 2.6) {
      goal = 2; // hold under skin
    } else if (cycle < 3.4) {
      goal = 2 - ((cycle - 2.6) / 0.8) * 2; // retract for replay
    } else {
      goal = 0;
    }
    // Softly pull toward current narrative step so Next still matters
    const stepBias = step <= 0 ? 0 : step === 1 ? 1.2 : 2;
    const blended = THREE.MathUtils.lerp(goal, Math.max(goal, stepBias), step >= 2 ? 0.85 : 0.25);
    progress.current = THREE.MathUtils.damp(progress.current, blended, 4.0, delta);

    const t = Math.max(0, Math.min(2, progress.current));
    const from = Math.floor(t);
    const to = Math.min(2, from + 1);
    const local = t - from;
    const a = targets[from];
    const b = targets[to];
    if (deviceRef.current) {
      deviceRef.current.position.set(
        THREE.MathUtils.lerp(a.pos[0], b.pos[0], local),
        THREE.MathUtils.lerp(a.pos[1], b.pos[1], local),
        THREE.MathUtils.lerp(a.pos[2], b.pos[2], local)
      );
      deviceRef.current.rotation.set(
        THREE.MathUtils.lerp(a.rot[0], b.rot[0], local),
        THREE.MathUtils.lerp(a.rot[1], b.rot[1], local),
        THREE.MathUtils.lerp(a.rot[2], b.rot[2], local)
      );
      // Slightly shrink as it seats under the skin
      const seat = t / 2;
      const s = THREE.MathUtils.lerp(1.05, 0.92, seat);
      deviceRef.current.scale.setScalar(s);
    }
    if (groupRef.current) {
      groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.35) * 0.08;
    }
    const seated = progress.current > 1.4;
    if (guideRef.current) guideRef.current.visible = !seated;
    if (seatedTagRef.current) seatedTagRef.current.visible = seated;
  });

  const basePos = isMobile ? [0, -0.2, 0] : [0.3, -0.1, 0];
  if (!ready) return null;

  return (
    <group ref={groupRef} position={basePos}>
      <primitive object={armScene} />
      {/* Tag on the arm / hand */}
      <SceneTag position={[-0.55, -0.05, 0.15]} tone="teal" side="right" distanceFactor={isMobile ? 4.8 : 5.8}>
        Your arm
      </SceneTag>
      <group ref={deviceRef}>
        {mode === "injectable" ? (
          <>
            <mesh position={[0, 0.08, 0]}>
              <cylinderGeometry args={[0.025, 0.025, 0.18, 12]} />
              <meshStandardMaterial color="#E8F4F5" transparent opacity={0.85} roughness={0.3} />
            </mesh>
            <mesh position={[0, -0.05, 0]}>
              <cylinderGeometry args={[0.006, 0.006, 0.12, 8]} />
              <meshStandardMaterial color="#9CA3AF" metalness={0.7} roughness={0.2} />
            </mesh>
            <SceneTag position={[0.12, 0.16, 0.04]} tone="cream" side="left" distanceFactor={5}>
              Injection
            </SceneTag>
          </>
        ) : (
          <>
            <mesh>
              <cylinderGeometry args={[0.016, 0.016, 0.24, 12]} />
              <meshStandardMaterial
                color="#F5F0E6"
                roughness={0.9}
                metalness={0.02}
                emissive="#E8E0D0"
                emissiveIntensity={0.08}
              />
            </mesh>
            <mesh position={[0, 0.12, 0]}>
              <sphereGeometry args={[0.016, 12, 12]} />
              <meshStandardMaterial color="#F5F0E6" roughness={0.9} metalness={0.02} />
            </mesh>
            <mesh position={[0, -0.12, 0]}>
              <sphereGeometry args={[0.016, 12, 12]} />
              <meshStandardMaterial color="#F5F0E6" roughness={0.9} metalness={0.02} />
            </mesh>
            {/* Tag sticks to the moving rod */}
            <SceneTag position={[0.14, 0.02, 0.02]} tone="cream" side="left" distanceFactor={5}>
              Implant rod
            </SceneTag>
          </>
        )}
      </group>
      <pointLight position={[0.3, 0.5, 0.6]} intensity={1.1} color="#ffffff" />
      <pointLight position={[-0.2, 0.1, 0.4]} intensity={0.6} color="#0E7A80" />
      {/* Insertion site marker */}
      <mesh position={[0.01, 0.16, 0.03]} rotation={[Math.PI / 2.4, 0.2, 0]}>
        <ringGeometry args={[0.035, 0.05, 28]} />
        <meshBasicMaterial color="#5C3C7A" transparent opacity={0.7} side={THREE.DoubleSide} />
      </mesh>
      {/* Arrow + "rod goes here" — hidden once seated via ref */}
      <group ref={guideRef}>
        <InsertionArrow from={[0.22, 0.38, 0.28]} to={[0.01, 0.16, 0.03]} />
      </group>
      <group ref={seatedTagRef} visible={false}>
        <SceneTag position={[0.06, 0.24, 0.06]} tone="purple" side="down" distanceFactor={5.5}>
          Under the skin here
        </SceneTag>
      </group>
    </group>
  );
}

/** Condom 3D — packaging/device model with a gentle “ready to use” pulse */
function RealCondomScene({ isMobile }) {
  const gltf = useGLTF("/models/condom/scene.gltf");
  const groupRef = useRef();
  const scene = useMemo(() => {
    const cloned = SkeletonUtils.clone(gltf.scene);
    const box = new THREE.Box3().setFromObject(cloned);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const target = isMobile ? 1.4 : 1.8;
    cloned.scale.setScalar(target / maxDim);
    const center = new THREE.Vector3();
    new THREE.Box3().setFromObject(cloned).getCenter(center);
    cloned.position.sub(center);
    return cloned;
  }, [gltf.scene, isMobile]);

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;
    groupRef.current.rotation.y = t * 0.45;
    // Soft “place / ready” breathe so it doesn’t feel static
    const pulse = 1 + Math.sin(t * 1.6) * 0.04;
    groupRef.current.scale.setScalar(pulse);
    groupRef.current.position.y = Math.sin(t * 1.2) * 0.03;
  });

  return (
    <group ref={groupRef} position={isMobile ? [0, -0.1, 0] : [0.1, 0, 0]}>
      <primitive object={scene} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[2, 3, 2]} intensity={1.2} />
    </group>
  );
}

/**
 * Real IUD insertion using uterus.glb + iud.glb.
 * Uterus asset is closed, so we ghost it (transparent) to show the device
 * moving through the cervix into the cavity — educational, not surgical.
 */
function RealIudInsertionScene({ step, isMobile, variant = "copper" }) {
  const uterusGltf = useGLTF("/models/uterus.glb");
  const iudGltf = useGLTF("/models/iud.glb");
  const groupRef = useRef();
  const iudRef = useRef();
  const progress = useRef(0);
  const [ready, setReady] = useState(false);

  const uterusScene = useMemo(() => {
    const cloned = SkeletonUtils.clone(uterusGltf.scene);
    cloned.traverse((child) => {
      if (child.isMesh) {
        child.material = child.material.clone();
        child.material.transparent = true;
        child.material.opacity = 0.34;
        child.material.depthWrite = false;
        child.material.side = THREE.DoubleSide;
        if (child.material.color) {
          child.material.color.lerp(new THREE.Color("#EC4899"), 0.25);
        }
      }
    });
    return cloned;
  }, [uterusGltf.scene]);

  const iudScene = useMemo(() => {
    const cloned = SkeletonUtils.clone(iudGltf.scene);
    cloned.traverse((child) => {
      if (child.isMesh) {
        child.material = child.material.clone();
        if (variant === "copper") {
          child.material.color = new THREE.Color("#B87333");
          child.material.metalness = 0.85;
          child.material.roughness = 0.25;
        } else {
          child.material.color = new THREE.Color("#5C3C7A");
          child.material.metalness = 0.2;
          child.material.roughness = 0.45;
        }
        child.material.emissive = new THREE.Color(variant === "copper" ? "#5a3a12" : "#2a1840");
        child.material.emissiveIntensity = 0.15;
      }
    });
    return cloned;
  }, [iudGltf.scene, variant]);

  useEffect(() => {
    // Normalize uterus size so it fills the focus panel
    const box = new THREE.Box3().setFromObject(uterusScene);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const target = isMobile ? 1.6 : 2.0;
    uterusScene.scale.setScalar(target / maxDim);
    const center = new THREE.Vector3();
    box.getCenter(center);
    uterusScene.position.sub(center.multiplyScalar(target / maxDim));

    // IUD relative scale — small T-device inside cavity
    const iudBox = new THREE.Box3().setFromObject(iudScene);
    const iudSize = new THREE.Vector3();
    iudBox.getSize(iudSize);
    const iudMax = Math.max(iudSize.x, iudSize.y, iudSize.z) || 1;
    iudScene.scale.setScalar((isMobile ? 0.28 : 0.35) / iudMax);
    setReady(true);
  }, [uterusScene, iudScene, isMobile]);

  // Step targets: outside cervix → through canal → settled high in cavity
  const targets = [
    { pos: [0, -0.62, 0.18], rot: [0.45, 0, 0], fold: 0.12 },
    { pos: [0, -0.22, 0.04], rot: [0.12, 0, 0], fold: 0.55 },
    { pos: [0, 0.08, -0.01], rot: [0, 0, 0], fold: 1 },
  ];

  useFrame((state, delta) => {
    // Loop insertion so learners see the device go in repeatedly
    const cycleLen = step >= 2 ? 5.5 : 4.4;
    const cycle = state.clock.elapsedTime % cycleLen;
    let goal;
    if (step >= 2) {
      goal = 2;
    } else if (cycle < 1.5) {
      goal = (cycle / 1.5) * 2;
    } else if (cycle < 2.7) {
      goal = 2;
    } else if (cycle < 3.5) {
      goal = 2 - ((cycle - 2.7) / 0.8) * 2;
    } else {
      goal = 0;
    }
    const stepBias = step <= 0 ? 0 : step === 1 ? 1.15 : 2;
    const blended = THREE.MathUtils.lerp(goal, Math.max(goal, stepBias), step >= 2 ? 0.9 : 0.28);
    progress.current = THREE.MathUtils.damp(progress.current, blended, 4.2, delta);

    const t = Math.max(0, Math.min(2, progress.current));
    const from = Math.floor(t);
    const to = Math.min(2, from + 1);
    const local = t - from;
    const a = targets[from];
    const b = targets[to];

    if (iudRef.current) {
      iudRef.current.position.set(
        THREE.MathUtils.lerp(a.pos[0], b.pos[0], local),
        THREE.MathUtils.lerp(a.pos[1], b.pos[1], local),
        THREE.MathUtils.lerp(a.pos[2], b.pos[2], local)
      );
      iudRef.current.rotation.x = THREE.MathUtils.lerp(a.rot[0], b.rot[0], local);
      const fold = THREE.MathUtils.lerp(a.fold, b.fold, local);
      iudRef.current.scale.set(0.35 + fold * 0.65, 1, 0.35 + fold * 0.65);
    }

    if (groupRef.current) {
      groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.4) * 0.12;
    }
  });

  const basePos = isMobile ? [0, -0.15, 0] : [0.35, -0.05, 0];

  if (!ready) return null;

  const inside = progress.current > 1.5;

  return (
    <group ref={groupRef} position={basePos}>
      <primitive object={uterusScene} />
      <group ref={iudRef}>
        <primitive object={iudScene} />
      </group>
      <pointLight position={[0, -0.5, 0.2]} color="#0E7A80" intensity={inside ? 0.35 : 1.2} distance={1.2} />
      <pointLight
        position={[0, 0.1, 0.3]}
        color={variant === "copper" ? "#B87333" : "#5C3C7A"}
        intensity={inside ? 1.5 : 0.5}
        distance={1.4}
      />
      <mesh position={[0, -0.55, 0.14]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.055, 0.006, 8, 32]} />
        <meshStandardMaterial
          color="#0E7A80"
          emissive="#0E7A80"
          emissiveIntensity={inside ? 0.2 : 1.2}
          transparent
          opacity={inside ? 0.2 : 0.9}
        />
      </mesh>
    </group>
  );
}

/** Legacy primitive fallback if GLBs fail to load */
function CopperIudRedesignScene({ step, isMobile }) {
  const groupRef = useRef();
  const deviceRef = useRef();
  const progress = useRef(0);
  const basePos = isMobile ? [0, -0.4, 0] : [0.4, -0.2, 0];
  const baseScale = isMobile ? 0.75 : 1.0;

  useFrame((state, delta) => {
    const cycle = state.clock.elapsedTime % 4;
    let goal = cycle < 1.3 ? (cycle / 1.3) * 2 : cycle < 2.5 ? 2 : cycle < 3.3 ? 2 - ((cycle - 2.5) / 0.8) * 2 : 0;
    if (step >= 2) goal = 2;
    progress.current = THREE.MathUtils.damp(progress.current, goal, 4, delta);
    const t = progress.current / 2;
    if (deviceRef.current) {
      deviceRef.current.position.y = THREE.MathUtils.lerp(-0.45, -0.26, t);
      deviceRef.current.scale.x = THREE.MathUtils.lerp(0.4, 1, Math.max(0, t - 0.5) * 2);
    }
    if (groupRef.current) groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.4) * 0.08;
  });

  return (
    <group ref={groupRef} position={basePos} scale={baseScale}>
      <mesh position={[0, -0.28, 0.01]}>
        <coneGeometry args={[0.15, 0.28, 4]} />
        <meshBasicMaterial color="#EC4899" wireframe transparent opacity={0.25} />
      </mesh>
      <group ref={deviceRef} position={[0, -0.45, 0.02]}>
        <mesh position={[0, -0.04, 0]}>
          <cylinderGeometry args={[0.008, 0.008, 0.1, 8]} />
          <meshStandardMaterial color={0xb87333} metalness={0.9} roughness={0.2} />
        </mesh>
        <mesh position={[0, 0.02, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.008, 0.008, 0.1, 8]} />
          <meshStandardMaterial color={0xb87333} metalness={0.9} roughness={0.2} />
        </mesh>
      </group>
    </group>
  );
}

function CocRedesignScene({ step, isMobile }) {
  const [particles] = useState(() => {
    const arr = [];
    for (let i = 0; i < 30; i++) {
      arr.push({
        t: Math.random(),
        speed: 0.006 + Math.random() * 0.006
      });
    }
    return arr;
  });

  const pRefs = useRef([]);
  const basePos = isMobile ? [0, -0.4, 0] : [0.4, -0.2, 0];
  const baseScale = isMobile ? 0.75 : 1.0;

  useFrame(() => {
    if (step < 1) return;
    particles.forEach((p, idx) => {
      const ref = pRefs.current[idx];
      if (!ref) return;

      p.t += p.speed;
      if (p.t > 1) p.t = 0;

      // Pathway: Stomach [0, 0.1, 0.02] -> Brain/Hypothalamus [0, 0.58, 0.02] -> Ovaries [0.12, -0.28, 0.02]
      let tx, ty, tz;
      if (p.t < 0.5) {
        // First half: Stomach to Head
        const progress = p.t * 2;
        tx = 0;
        ty = THREE.MathUtils.lerp(0.1, 0.58, progress);
        tz = 0.02;
      } else {
        // Second half: Head to Ovaries
        const progress = (p.t - 0.5) * 2;
        const targetX = idx % 2 === 0 ? 0.12 : -0.12;
        tx = THREE.MathUtils.lerp(0, targetX, progress);
        ty = THREE.MathUtils.lerp(0.58, -0.28, progress);
        tz = 0.02;
      }

      ref.position.set(tx, ty, tz);
    });
  });

  return (
    <group position={basePos} scale={baseScale}>
      {/* Brain Pituitary Sphere (purple: 0x5C3C7A, pulsing) */}
      <mesh position={[0, 0.58, 0.02]}>
        <sphereGeometry args={[0.045, 12, 12]} />
        <meshStandardMaterial
          color={0x5C3C7A}
          emissive={0x5C3C7A}
          emissiveIntensity={1.5 + Math.sin(Date.now() * 0.006) * 0.5}
        />
      </mesh>

      {/* Stomach marker */}
      <mesh position={[0, 0.1, 0.02]}>
        <sphereGeometry args={[0.04, 8, 8]} />
        <meshBasicMaterial color="#10B981" transparent opacity={0.3} wireframe />
      </mesh>

      {/* Ovaries */}
      <mesh position={[0.12, -0.28, 0]}>
        <sphereGeometry args={[0.03, 12, 12]} />
        <meshStandardMaterial
          color={step >= 2 ? "#1E293B" : "#EC4899"}
          emissive={step >= 2 ? "#000" : "#EC4899"}
          emissiveIntensity={step >= 2 ? 0 : 1.2}
        />
      </mesh>
      <mesh position={[-0.12, -0.28, 0]}>
        <sphereGeometry args={[0.03, 12, 12]} />
        <meshStandardMaterial
          color={step >= 2 ? "#1E293B" : "#EC4899"}
          emissive={step >= 2 ? "#000" : "#EC4899"}
          emissiveIntensity={step >= 2 ? 0 : 1.2}
        />
      </mesh>

      {/* Cervix mucus disc (slightly opaque disc) */}
      {step >= 2 && (
        <mesh position={[0, -0.4, 0.02]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.04, 0.04, 0.01, 16]} />
          <meshPhongMaterial color="#0E7A80" transparent opacity={0.8} shininess={80} />
        </mesh>
      )}

      {/* Traveling Particles */}
      {step >= 1 &&
        particles.map((p, idx) => (
          <mesh key={idx} ref={(el) => (pRefs.current[idx] = el)}>
            <sphereGeometry args={[0.008, 6, 6]} />
            <meshStandardMaterial color="#4DD6DC" emissive="#4DD6DC" emissiveIntensity={1.5} />
          </mesh>
        ))}
    </group>
  );
}

// -------------------------------------------------------------
// Narration dictionary definitions
// -------------------------------------------------------------
const METHOD_DETAILS = {
  implant: {
    title: "Implant",
    steps: [
      {
        title: "Meet the rod",
        text: "The implant is a small, soft, off-white rod — about the size of a matchstick (roughly 4 cm long). A clinician places it; you do not insert it yourself.",
        animation: "TalkingOne"
      },
      {
        title: "Under the skin of the upper arm",
        text: "After a little local anaesthetic, the rod is slid just under the skin of the inner upper arm. Watch it move from above the skin into place in the 3D model.",
        animation: "TalkingOne"
      },
      {
        title: "Settled & working",
        text: "Once in place you can often feel it with your fingertips, but it stays under the skin. It slowly releases progestin for 3–5 years — no daily pill needed. Removal is also done in a clinic.",
        animation: "ThumbsUp"
      }
    ]
  },
  iud_copper: {
    title: "Copper IUD",
    steps: [
      {
        title: "Ready at the cervix",
        text: "A clinician gently guides a thin tube to the cervix (the opening of the uterus). The IUD sits folded inside the tube — watch it waiting at the entrance in the 3D model.",
        animation: "TalkingOne"
      },
      {
        title: "Insertion through the cervix",
        text: "The tube is advanced into the uterus. The IUD is released and its arms begin to open as it moves into the uterine cavity. This part is quick — usually a few minutes in clinic.",
        animation: "TalkingOne"
      },
      {
        title: "In place & working",
        text: "The T-shaped copper IUD sits high in the uterus. Copper ions create an environment sperm cannot thrive in — no hormones needed. Strings stay so it can be checked or removed later.",
        animation: "ThumbsUp"
      }
    ]
  },
  iud_lng: {
    title: "Hormonal IUD (LNG)",
    steps: [
      {
        title: "Ready at the cervix",
        text: "Same gentle placement path as the copper IUD: the device is folded in a thin tube and brought to the cervix by a trained provider.",
        animation: "TalkingOne"
      },
      {
        title: "Insertion through the cervix",
        text: "The tube enters the uterus and the hormonal IUD is released. Its arms open as it settles into the cavity — the process is similar to copper IUD insertion.",
        animation: "TalkingOne"
      },
      {
        title: "In place & working",
        text: "Once settled, it slowly releases a small local dose of progestin. That thickens cervical mucus and thins the lining — many women also get lighter periods.",
        animation: "ThumbsUp"
      }
    ]
  },
  coc: {
    title: "Combined Pill (COC)",
    steps: [
      {
        title: "Daily Oral Routine",
        text: "You take one pill daily at the same time. The pill contains two hormones, estrogen and progestin, which mimic your natural cycle.",
        animation: "TalkingOne"
      },
      {
        title: "Brain-Ovary Axis Suppression",
        text: "The hormones travel via blood to your pituitary gland in the brain, signaling it to pause egg development in your ovaries.",
        animation: "TalkingOne"
      },
      {
        title: "No Ovulation",
        text: "Because egg release is stopped, fertilization cannot happen. The pill also thickens cervical mucus to add an extra layer of protection.",
        animation: "ThumbsUp"
      }
    ]
  },
  pop: {
    title: "Mini-Pill (POP)",
    steps: [
      {
        title: "Progestin-Only Barrier",
        text: "Unlike the combined pill, the mini-pill contains only progestin. Its primary job is to thicken the cervical mucus to block sperm.",
        animation: "TalkingOne"
      },
      {
        title: "Partial Ovulation Control",
        text: "It may also stop your ovaries from releasing eggs, but its main, highly effective defense is the mucus plug at the cervix entrance.",
        animation: "TalkingOne"
      },
      {
        title: "The 3-Hour Window",
        text: "You must take this pill within the exact same 3-hour window every day. Being late weakens the mucus barrier, allowing sperm to cross.",
        animation: "Wave"
      }
    ]
  },
  injectable: {
    title: "Injectable (DMPA)",
    steps: [
      {
        title: "Intramuscular Injection",
        text: "A healthcare provider administers the injection into your upper arm muscle or buttock every 12 to 13 weeks (about 3 months).",
        animation: "TalkingOne"
      },
      {
        title: "Slow-Release Depot",
        text: "The fluid forms a small reservoir (depot) in your muscle, slowly releasing progestin into your body over the next 90 days.",
        animation: "TalkingOne"
      },
      {
        title: "Suppressed Ovulation",
        text: "The steady hormone levels stop the brain from signaling egg release, pausing ovulation completely while the depot remains active.",
        animation: "ThumbsUp"
      }
    ]
  },
  condom: {
    title: "Male Condom",
    steps: [
      {
        title: "What it looks like",
        text: "A condom is a thin latex (or non-latex) sheath. Check the packet is sealed and not expired before you open it.",
        animation: "TalkingOne"
      },
      {
        title: "How to use it",
        text: "Pinch the tip, roll it down onto an erect penis before any contact, and use a new one every time. Never use oil-based lotion with latex.",
        animation: "TalkingOne"
      },
      {
        title: "Dual protection",
        text: "Used correctly, condoms help prevent pregnancy and also reduce STI risk — the only method that does both.",
        animation: "ThumbsUp"
      }
    ]
  },
  lam: {
    title: "Lactational Amenorrhea (LAM)",
    steps: [
      {
        title: "What LAM is",
        text: "LAM is a temporary natural method that uses exclusive breastfeeding to delay the return of fertility after birth.",
        animation: "TalkingOne"
      },
      {
        title: "When it works",
        text: "It only works if all three are true: your baby is under 6 months, you breastfeed fully (day and night), and your periods have not returned.",
        animation: "TalkingOne"
      },
      {
        title: "Plan the next method",
        text: "If any of those conditions change, switch to another method right away — condoms, POP, implant, or an IUD after clinic advice.",
        animation: "ThumbsUp"
      }
    ]
  },
  emergency: {
    title: "Emergency Pill (EC)",
    steps: [
      {
        title: "Delaying Ovulation",
        text: "Emergency pills contain a high dose of hormones that delay or stop an egg from being released from your ovary.",
        animation: "TalkingOne"
      },
      {
        title: "The 72-Hour Window",
        text: "It is most effective when taken as soon as possible after unprotected sex—ideally within 24 hours, and up to 72 hours.",
        animation: "TalkingOne"
      },
      {
        title: "Prevention, Not Reversal",
        text: "EC works by delaying egg release. If ovulation has already happened, the pill cannot prevent pregnancy. It is not an abortion pill.",
        animation: "Wave"
      }
    ]
  }
};

// -------------------------------------------------------------
// Fallback UI
// -------------------------------------------------------------

const EXPLAINER_PROMPTS = {
  implant: ["Does insertion hurt?", "How long does it last?", "Can I feel it under my skin?", "How is it removed?"],
  injectable: ["How often do I need it?", "Does the injection hurt?", "Can I get pregnant after stopping?"],
  iud_copper: ["Does insertion hurt?", "Is it hormone-free?", "How long can it stay?", "Will periods change?"],
  iud_lng: ["Does insertion hurt?", "Will my periods stop?", "How long does it last?", "Can I remove it early?"],
  condom: ["How do I use it correctly?", "Does it protect against STIs?", "What if it breaks?"],
  coc: ["What if I miss a pill?", "Is it safe while breastfeeding?", "Common side effects?"],
  pop: ["What if I'm late taking it?", "Is it OK while breastfeeding?", "Does it stop periods?"],
  lam: ["When does LAM stop working?", "What should I switch to next?", "Do I need exclusive breastfeeding?"],
  emergency: ["How soon should I take it?", "Is it an abortion pill?", "Can I use it often?"],
};

function localExplainerReply(method, question) {
  const title = METHOD_DETAILS[method]?.title || method;
  const q = question.toLowerCase();
  if (q.includes("hurt") || q.includes("pain")) {
    return `${title}: brief discomfort is common during clinic placement. Local anaesthetic is often used for implants. Ask your clinic what to expect.`;
  }
  if (q.includes("long") || q.includes("last") || q.includes("year")) {
    return `${title} duration depends on the product — your counselor or clinic can confirm the exact years for the brand available where you are.`;
  }
  if (q.includes("remov") || q.includes("stop")) {
    return `Most methods can be stopped or removed at a clinic when you want to try for pregnancy or switch. Fertility usually returns after removal (timing varies by method).`;
  }
  if (q.includes("sti") || q.includes("hiv") || q.includes("infection")) {
    return `Only condoms help protect against STIs and HIV. Other methods prevent pregnancy but not infections — dual protection is wise if STI risk is a concern.`;
  }
  if (q.includes("breast")) {
    return `Progestogen-only options (POP, implant, injectable, LNG-IUD) and condoms are often considered while breastfeeding. Combined pills may not be first-line early postpartum — confirm with a clinician.`;
  }
  return `You're viewing the 3D guide for ${title}. I can explain how it works, side effects, or clinic follow-up. For personal medical advice, please confirm with a clinic or CHW.`;
}

function ExplainerChatBot({ method, doctorId, isMobile = false, className = "" }) {
  const title = METHOD_DETAILS[method]?.title || "this method";
  const [open, setOpen] = useState(true);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState(() => [
    {
      role: "bot",
      text: `Ask me anything about ${title} while you watch the 3D demo — side effects, how it's placed, or what to expect at the clinic.`,
    },
  ]);
  const listRef = useRef(null);
  const sessionId = useMemo(() => `explainer-${method}-${Date.now()}`, [method]);
  const prompts = EXPLAINER_PROMPTS[method] || EXPLAINER_PROMPTS.implant;

  useEffect(() => {
    setMessages([
      {
        role: "bot",
        text: `Ask me anything about ${METHOD_DETAILS[method]?.title || method} while you watch the 3D demo — side effects, how it's placed, or what to expect at the clinic.`,
      },
    ]);
    setInput("");
  }, [method]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, busy, open]);

  const ask = async (raw) => {
    const text = (raw || "").trim();
    if (!text || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text }]);
    setBusy(true);
    try {
      const res = await postChat({
        message: text,
        session_id: sessionId,
        language: "en",
        context: {
          mode: "explainer_3d",
          method,
          method_title: METHOD_DETAILS[method]?.title || method,
          doctor: doctorId || "amara",
          triage_summary: `User is viewing the 3D explainer for ${METHOD_DETAILS[method]?.title || method}. Answer briefly and clearly about this method only.`,
        },
      });
      const reply = (res?.reply || "").trim() || localExplainerReply(method, text);
      setMessages((m) => [...m, { role: "bot", text: reply }]);
    } catch {
      setMessages((m) => [...m, { role: "bot", text: localExplainerReply(method, text) }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`pointer-events-auto z-40 flex flex-col overflow-hidden border border-teal-900/50 bg-[#111F2E]/95 shadow-2xl backdrop-blur-md transition-all ${
        isMobile
          ? "absolute inset-x-3 bottom-[210px] max-h-[38vh] rounded-2xl"
          : "absolute left-4 top-24 w-[320px] max-h-[min(420px,55vh)] rounded-2xl"
      } ${className}`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 border-b border-teal-950 px-3.5 py-2.5 text-left hover:bg-white/5"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-teal-300">
          <MessageCircle className="h-4 w-4" /> Ask about {title}
        </span>
        {open ? <ChevronDown className="h-4 w-4 text-[#7A9BA8]" /> : <ChevronUp className="h-4 w-4 text-[#7A9BA8]" />}
      </button>

      {open && (
        <>
          <div ref={listRef} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3 py-3">
            {messages.map((m, i) => (
              <div
                key={`${m.role}-${i}`}
                className={`max-w-[92%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                  m.role === "user"
                    ? "ml-auto bg-[#0E7A80] text-white"
                    : "mr-auto border border-teal-900/40 bg-[#0D1B2A] text-[#E8F4F5]"
                }`}
              >
                {m.text}
              </div>
            ))}
            {busy && (
              <div className="mr-auto rounded-2xl border border-teal-900/40 bg-[#0D1B2A] px-3 py-2 text-xs text-[#7A9BA8]">
                Thinking…
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5 border-t border-teal-950 px-3 py-2">
            {prompts.slice(0, 3).map((p) => (
              <button
                key={p}
                type="button"
                disabled={busy}
                onClick={() => ask(p)}
                className="rounded-full border border-teal-900/50 bg-[#0D1B2A] px-2.5 py-1 text-[10px] font-medium text-[#7A9BA8] hover:border-[#0E7A80] hover:text-teal-300 disabled:opacity-50"
              >
                {p}
              </button>
            ))}
          </div>

          <form
            className="flex gap-2 border-t border-teal-950 p-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              ask(input);
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a question…"
              disabled={busy}
              className="min-w-0 flex-1 rounded-xl border border-teal-900/50 bg-[#0D1B2A] px-3 py-2 text-xs text-white placeholder:text-[#7A9BA8] outline-none focus:border-[#0E7A80]"
            />
            <Button
              type="submit"
              size="icon"
              disabled={busy || !input.trim()}
              className="h-9 w-9 shrink-0 rounded-xl bg-[#0E7A80] hover:bg-[#0A6268]"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </>
      )}
    </div>
  );
}

function StaticExplainerFallback({ method, onClose, availableMethods, onSwitchMethod, doctorId }) {
  const details = METHOD_DETAILS[method] || METHOD_DETAILS.implant;
  const [activeStep, setActiveStep] = useState(0);

  return (
    <div className="fixed inset-0 z-50 bg-[#0D1B2A] text-white flex flex-col p-6 font-sans overflow-y-auto relative">
      <div className="flex justify-between items-center border-b border-teal-900 pb-3 mb-6">
        <div className="flex items-center gap-2">
          <Shield className="h-6 w-6 text-teal-400" />
          <h2 className="text-xl font-bold text-teal-400">{details.title} Action Explainer</h2>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="text-teal-400 hover:text-white">
          <X className="h-6 w-6" />
        </Button>
      </div>

      <ExplainerChatBot
        method={method}
        doctorId={doctorId}
        isMobile={false}
        className="!relative !inset-auto !top-auto !left-auto !bottom-auto mb-4 w-full max-w-2xl mx-auto max-h-[280px]"
      />

      <div className="flex-1 max-w-2xl mx-auto w-full flex flex-col justify-center gap-6 py-4">
        <div className="bg-[#111F2E] border border-teal-900/50 rounded-2xl p-6 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-3">
            <Badge variant="secondary" className="bg-[#0E7A80]/15 text-[#4DD6DC] border border-[#0E7A80]/30">
              Step {activeStep + 1} of {details.steps.length}
            </Badge>
          </div>

          <h3 className="text-lg font-semibold text-teal-300 mt-2 mb-4">
            {details.steps[activeStep].title}
          </h3>
          <p className="text-gray-200 leading-relaxed text-sm md:text-base">
            {details.steps[activeStep].text}
          </p>
        </div>
      </div>

      {/* Switcher & controls at the bottom */}
      <div className="mt-auto max-w-2xl mx-auto w-full flex flex-col gap-4 py-4 border-t border-teal-900/40">
        {/* Method switcher */}
        {availableMethods && (
          <div className="flex justify-center gap-2">
            {availableMethods.map((m) => (
              <button
                key={m}
                onClick={() => {
                  onSwitchMethod(m);
                  setActiveStep(0);
                }}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                  m === method 
                    ? "bg-[#0E7A80] border-[#0E7A80] text-white" 
                    : "bg-[#111F2E] border-teal-900/50 text-[#7A9BA8] hover:text-white"
                }`}
              >
                {METHOD_DETAILS[m]?.title || m}
              </button>
            ))}
          </div>
        )}

        <div className="flex justify-between items-center gap-4">
          <Button
            variant="outline"
            disabled={activeStep === 0}
            onClick={() => setActiveStep((prev) => prev - 1)}
            className="border-teal-900 text-teal-400 hover:bg-teal-950"
          >
            Back
          </Button>
          <div className="flex gap-2">
            {details.steps.map((_, idx) => (
              <span
                key={idx}
                className={`h-2 w-2 rounded-full transition-all duration-300 ${
                  idx === activeStep ? "bg-teal-400 w-5" : "bg-teal-950"
                }`}
              />
            ))}
          </div>
          {activeStep < details.steps.length - 1 ? (
            <Button
              onClick={() => setActiveStep((prev) => prev + 1)}
              className="bg-teal-600 hover:bg-teal-700 text-white"
            >
              Next
            </Button>
          ) : (
            <Button onClick={onClose} className="bg-teal-600 hover:bg-teal-700 text-white">
              Done
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// Main Redesigned Body Visualization Overlay Component
// -------------------------------------------------------------
export default function BodyVisualization({ method: initialMethod, doctorId, onClose, recommendations }) {
  const [method, setMethod] = useState(initialMethod);
  const [webGLSupported, setWebGLSupported] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [activeStep, setActiveStep] = useState(0);

  // Doctor avatar state syncs
  const [isTalking, setIsTalking] = useState(false);

  // Typewriter effect state
  const [displayedText, setDisplayedText] = useState("");

  // Controls
  const [cameraZoom, setCameraZoom] = useState(2.2);
  const [autoRotate, setAutoRotate] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  // Tooltip
  const [hoveredPart, setHoveredPart] = useState(null);

  const details = METHOD_DETAILS[method] || METHOD_DETAILS.implant;

  // Get recommended methods list for switcher
  const availableMethods = recommendations?.recommendations?.map((r) => r.method) || ["implant", "iud_copper", "coc"];

  useEffect(() => {
    if (!isWebGLAvailable()) {
      setWebGLSupported(false);
    }
    const checkSize = () => setIsMobile(window.innerWidth < 768);
    checkSize();
    window.addEventListener("resize", checkSize);
    return () => window.removeEventListener("resize", checkSize);
  }, []);

  // Sync Typewriter with Step changes
  useEffect(() => {
    const fullText = details.steps[activeStep]?.text || "";
    setDisplayedText("");
    setIsTalking(true);

    let idx = 0;
    const interval = setInterval(() => {
      setDisplayedText((prev) => prev + fullText.charAt(idx));
      idx++;
      if (idx >= fullText.length) {
        clearInterval(interval);
        setIsTalking(false);
      }
    }, 30);

    return () => {
      clearInterval(interval);
      setIsTalking(false);
    };
  }, [activeStep, method, details]);

  if (!webGLSupported) {
    return (
      <StaticExplainerFallback 
        method={method} 
        onClose={onClose} 
        availableMethods={availableMethods} 
        onSwitchMethod={(m) => { setMethod(m); setActiveStep(0); }}
        doctorId={doctorId}
      />
    );
  }

  const textFallback = (
    <StaticExplainerFallback
      method={method}
      onClose={onClose}
      availableMethods={availableMethods}
      onSwitchMethod={(m) => { setMethod(m); setActiveStep(0); }}
      doctorId={doctorId}
    />
  );

  // Camera limits & dynamic zoom
  const currentCameraZ = cameraZoom;

  return (
    <Vis3DErrorBoundary key={method} fallback={textFallback}>
    <div className="fixed inset-0 z-50 bg-[#0D1B2A] text-white flex flex-col overflow-hidden font-sans">
      
      {/* Background radial gradient glow behind the body */}
      <div 
        className="absolute inset-0 z-0 pointer-events-none" 
        style={{
          background: "radial-gradient(circle at 60% 50%, rgba(14,122,128,0.14) 0%, #0D1B2A 70%)"
        }}
      />

      {/* Main Canvas view — method only (no second doctor GLB; chat already has one) */}
      <div className="relative flex-1 h-full w-full z-10">
        <ExplainerChatBot method={method} doctorId={doctorId} isMobile={isMobile} />
        <Suspense
          fallback={
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0D1B2A] text-white z-50">
              <span className="h-10 w-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-teal-400 font-semibold">Configuring 3D Scene...</p>
            </div>
          }
        >
          <Canvas
            key={`${resetKey}-${method}`}
            camera={{ position: [0, 0.15, currentCameraZ], fov: 38 }}
            style={{ background: "transparent", width: "100%", height: "100%" }}
            gl={{ alpha: true, antialias: true, powerPreference: "default", failIfMajorPerformanceCaveat: false }}
            dpr={[1, 1.5]}
          >
            <ambientLight intensity={0.45} />
            <directionalLight position={[1, 3, 2]} intensity={1.0} color="#ffffff" />
            <pointLight position={[-1, 1, 1]} intensity={0.7} color="#0E7A80" />
            <pointLight position={[1, -1, 2]} intensity={0.35} color="#5C3C7A" />

            {/* Method-specific real assets vs silhouette overlays */}
            {method === "iud_copper" || method === "iud_lng" ? (
              <Suspense fallback={null}>
                <RealIudInsertionScene
                  step={activeStep}
                  isMobile={isMobile}
                  variant={method === "iud_lng" ? "hormonal" : "copper"}
                />
              </Suspense>
            ) : method === "implant" || method === "injectable" ? (
              <Suspense fallback={null}>
                <RealImplantInsertionScene
                  step={activeStep}
                  isMobile={isMobile}
                  mode={method === "injectable" ? "injectable" : "implant"}
                />
              </Suspense>
            ) : method === "condom" ? (
              <Suspense fallback={null}>
                <RealCondomScene isMobile={isMobile} />
              </Suspense>
            ) : (
              <>
                <BodySilhouetteMesh
                  isMobile={isMobile}
                  onPartHover={setHoveredPart}
                  activeMethod={method}
                />
                {method === "coc" && <CocRedesignScene step={activeStep} isMobile={isMobile} />}
                {method === "pop" && <ImplantRedesignScene step={activeStep} isMobile={isMobile} />}
                {method === "lam" && <CocRedesignScene step={activeStep} isMobile={isMobile} />}
                {method === "emergency" && <CocRedesignScene step={activeStep} isMobile={isMobile} />}
              </>
            )}

            <OrbitControls
              enableZoom={["iud_copper", "iud_lng", "implant", "injectable", "condom"].includes(method)}
              autoRotate={autoRotate}
              autoRotateSpeed={1.5}
              minPolarAngle={["iud_copper", "iud_lng", "implant", "injectable", "condom"].includes(method) ? 0.2 : Math.PI / 2 - 0.1}
              maxPolarAngle={["iud_copper", "iud_lng", "implant", "injectable", "condom"].includes(method) ? Math.PI - 0.2 : Math.PI / 2 + 0.1}
            />
          </Canvas>
        </Suspense>

        {/* -------------------------------------------------------------
            HTML Interface Overlays
            ------------------------------------------------------------- */}

        {/* 1. Header & Close Button */}
        <div className="absolute top-0 inset-x-0 p-5 bg-gradient-to-b from-[#0D1B2A] to-transparent flex justify-between items-start z-40 pointer-events-auto">
          <div>
            <h2 className="text-lg md:text-xl font-bold text-white tracking-tight flex items-center gap-2">
              {details.title} Explainer
            </h2>
            <p className="text-xs text-[#7A9BA8] font-medium uppercase tracking-wider">
              {method === "iud_copper" || method === "iud_lng"
                ? "3D insertion demo · uterus ghosted so you can see inside"
                : method === "implant" || method === "injectable"
                  ? "3D arm placement · rod matches real implant photo"
                  : method === "condom"
                    ? "3D product view · not anatomical"
                    : "3D Anatomical Mode"}
            </p>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onClose} 
            className="text-teal-400 hover:text-white rounded-full bg-[#111F2E]/60 border border-teal-900/30 w-10 h-10"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* 2. Top-Right Camera Controls Panel */}
        <div className="absolute top-20 right-5 z-40 flex flex-col gap-2 pointer-events-auto bg-[#111F2E]/90 border border-teal-900/40 rounded-xl p-2.5 backdrop-blur-md">
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-[#7A9BA8] hover:text-white"
            onClick={() => setCameraZoom((z) => Math.max(1.5, z - 0.2))}
            title="Zoom In"
          >
            <ZoomIn className="h-4.5 w-4.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-[#7A9BA8] hover:text-white"
            onClick={() => setCameraZoom((z) => Math.min(3.2, z + 0.2))}
            title="Zoom Out"
          >
            <ZoomOut className="h-4.5 w-4.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className={`h-8 w-8 ${autoRotate ? "text-teal-400" : "text-[#7A9BA8]"} hover:text-white`}
            onClick={() => setAutoRotate(!autoRotate)}
            title="Auto Rotate"
          >
            <RotateCw className="h-4.5 w-4.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-[#7A9BA8] hover:text-white border-t border-teal-900/20 mt-1 pt-1"
            onClick={() => {
              setCameraZoom(2.2);
              setAutoRotate(false);
              setResetKey((k) => k + 1);
            }}
            title="Reset View"
          >
            <RotateCcw className="h-4.5 w-4.5" />
          </Button>
        </div>

        {/* 3. Hover Raycaster Tooltip Display */}
        {hoveredPart && (
          <div 
            className="absolute z-50 bg-[#111F2E] border border-teal-900/50 rounded-xl p-3.5 shadow-2xl max-w-xs pointer-events-none animate-slide-down backdrop-blur-md"
            style={{
              left: `${hoveredPart.x + 15}px`,
              top: `${hoveredPart.y - 45}px`,
            }}
          >
            <h4 className="text-xs font-bold text-teal-400 mb-1 flex items-center gap-1.5 uppercase tracking-wide">
              <Eye className="h-3.5 w-3.5" /> {hoveredPart.title}
            </h4>
            <p className="text-[11px] text-gray-200 leading-relaxed font-normal">
              {hoveredPart.desc}
            </p>
          </div>
        )}

        {/* 4. Bottom Narration and Navigation Panel */}
        <div className="absolute bottom-6 inset-x-0 px-4 md:px-10 z-40 pointer-events-none">
          <div className="max-w-4xl mx-auto w-full bg-[#111F2E]/95 border border-teal-900/50 rounded-3xl p-5 shadow-2xl flex flex-col gap-4 pointer-events-auto backdrop-blur-xl">
            
            {/* Step Content */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between border-b border-teal-950 pb-2">
                <span className="text-[10px] uppercase font-bold tracking-wider text-[#7A9BA8]">
                  Step {activeStep + 1} of {details.steps.length}
                </span>
                <span className="text-xs text-teal-400 font-semibold uppercase tracking-wider">
                  {details.steps[activeStep].title}
                </span>
              </div>
              <div className="flex gap-3 items-start">
                {(method === "implant" || method === "injectable") && (
                  <img
                    src="/images/implant-rod.jpg"
                    alt="Contraceptive implant rod — small off-white matchstick-sized device"
                    className="w-16 h-16 md:w-20 md:h-20 rounded-xl object-cover border border-teal-900/40 shrink-0 shadow-lg"
                  />
                )}
                <p className="text-xs md:text-sm text-[#E8F4F5] leading-relaxed font-normal min-h-[50px] flex-1">
                  {displayedText}
                  <span className={`inline-block w-1 h-3.5 ml-0.5 bg-[#4DD6DC] ${isTalking ? "opacity-100" : "opacity-0 animate-pulse"}`} />
                </p>
              </div>
            </div>

            {/* Stepper Navigation and Method Switcher */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-1 border-t border-teal-950">
              
              {/* Method Switcher Pills */}
              <div className="flex gap-2">
                {availableMethods.slice(0, 2).map((m) => (
                  <button
                    key={m}
                    onClick={() => {
                      setMethod(m);
                      setActiveStep(0);
                    }}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all duration-300 ${
                      m === method
                        ? "bg-[#0E7A80] border-[#0E7A80] text-white shadow-lg shadow-[#0E7A80]/20"
                        : "bg-[#0D1B2A]/40 border-teal-900/40 text-[#7A9BA8] hover:text-white"
                    }`}
                  >
                    {METHOD_DETAILS[m]?.title || m}
                  </button>
                ))}
              </div>

              {/* Step Navigation buttons */}
              <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={activeStep === 0}
                  onClick={() => setActiveStep((prev) => prev - 1)}
                  className="border-teal-900 text-[#7A9BA8] hover:text-white hover:bg-teal-950/20"
                >
                  Back
                </Button>

                {/* Progress Indicators */}
                <div className="flex gap-1.5">
                  {details.steps.map((_, idx) => (
                    <span
                      key={idx}
                      className={`h-1.5 w-1.5 rounded-full transition-all duration-300 ${
                        idx === activeStep ? "bg-[#4DD6DC] w-4.5" : "bg-[#0D1B2A]"
                      }`}
                    />
                  ))}
                </div>

                {activeStep < details.steps.length - 1 ? (
                  <Button
                    size="sm"
                    onClick={() => setActiveStep((prev) => prev + 1)}
                    className="bg-[#0E7A80] hover:bg-[#0A6268] text-white font-bold px-4"
                  >
                    Next
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={onClose}
                    className="bg-[#0E7A80] hover:bg-[#0A6268] text-white font-bold px-4"
                  >
                    Finish
                  </Button>
                )}
              </div>

            </div>

          </div>
        </div>

      </div>
    </div>
    </Vis3DErrorBoundary>
  );
}
