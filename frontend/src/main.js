import {
  Float32BufferAttribute,
  Vector2,
  Vector3,
  Raycaster,
  PerspectiveCamera,
  Clock,
  Scene,
  PointsMaterial,
  Points,
  Material,
  WebGLRenderer,
  AxesHelper,
  BufferGeometry,
  BufferAttribute,
  MeshBasicMaterial,
  DoubleSide,
  Mesh,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { XYZLoader } from "three/examples/jsm/loaders/XYZLoader.js";

const gui = new dat.GUI({ name: "My GUI" });

const planes = generatePlanes(
  SURFACES_GEOLOGY_01[0].surface_roughness_data.node
);

let camera, scene, renderer, clock, axesHelper;
const mouse = new Vector2();
const raycaster = new Raycaster();
let intersected;

const guiConfig = {
  points: {
    size: 0.01,
    axis: 2,
    minDepth: 0.0,
    maxDepth: 1.0,
    minColor: [239, 138, 98],
    maxColor: [103, 169, 207],
    useMidColor: false,
    midColor: [247, 247, 247],
    useHSVLerp: true,
  },
  planes: {
    visible: true,
  },
};

let points, pointsColors, pointsMaterial;
const cloudCenter = new Vector3();
const planeMeshes = [];
const planeControls = [];

let controls;

configureGui();
init();
animate();

// Helper functions
function inverseLerp(a, b, v) {
  return (v - a) / (b - a);
}

function lerp(a, b, t) {
  return t * b - (t - 1) * a;
}
function rgb2hsv(r, g, b) {
  let v = Math.max(r, g, b),
    c = v - Math.min(r, g, b);
  let h =
    c && (v == r ? (g - b) / c : v == g ? 2 + (b - r) / c : 4 + (r - g) / c);
  return [60 * (h < 0 ? h + 6 : h), v && c / v, v];
}

let hsv2rgb = (
  h,
  s,
  v,
  f = (n, k = (n + h / 60) % 6) =>
    v - v * s * Math.max(Math.min(k, 4 - k, 1), 0)
) => [f(5), f(3), f(1)];

function lerpColor(a, b, t) {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

function lerpColorHSV(a, b, t) {
  const aHSV = rgb2hsv(a[0], a[1], a[2]);
  const bHSV = rgb2hsv(b[0], b[1], b[2]);

  const s = lerp(aHSV[1], bHSV[1], t);
  const v = lerp(aHSV[2], bHSV[2], t);

  let h;
  let d = bHSV[0] - aHSV[0];
  if (aHSV[0] > bHSV[0]) {
    // Swap
    const tempH = bHSV[0];
    bHSV[0] = aHSV[0];
    aHSV[0] = tempH;

    d *= -1;
    t = 1 - t;
  }

  if (d > 180) {
    aHSV[0] = aHSV[0] + 360;
    h = (aHSV[0] + t * (bHSV[0] - aHSV[0])) % 360;
  }
  if (d <= 180) {
    h = aHSV[0] + t * d;
  }

  const lerpedHSV = [h, s, v];
  const lerpedHSV2RBG = hsv2rgb(lerpedHSV[0], lerpedHSV[1], lerpedHSV[2]);
  return lerpedHSV2RBG;
}

// Gui config

function configureGui() {
  const pointsFolder = gui.addFolder("Points");
  pointsFolder.open();

  pointsFolder
    .add(guiConfig.points, "size", 0.0001, 1.0)
    .onChange(setPointsMaterialGUI);

  pointsFolder
    .add(guiConfig.points, "axis", 0, 2, 1)
    .onChange(setPointsVertexColor);

  pointsFolder
    .add(guiConfig.points, "minDepth", 0.0, 1.0, 0.01)
    .onChange(setPointsVertexColor);

  pointsFolder
    .add(guiConfig.points, "maxDepth", 0.0, 1.0, 0.01)
    .onChange(setPointsVertexColor);

  pointsFolder
    .addColor(guiConfig.points, "minColor")
    .onChange(setPointsVertexColor);

  pointsFolder
    .addColor(guiConfig.points, "maxColor")
    .onChange(setPointsVertexColor);

  pointsFolder
    .add(guiConfig.points, "useMidColor")
    .onChange(setPointsVertexColor);

  pointsFolder
    .addColor(guiConfig.points, "midColor")
    .onChange(setPointsVertexColor);

  pointsFolder
    .add(guiConfig.points, "useHSVLerp")
    .onChange(setPointsVertexColor);

  const planesFolder = gui.addFolder("Planes");

  planesFolder
    .add(guiConfig.planes, "visible")
    .onChange(changePlanesVisibility);
}

function pointCloudColorsByDepth(points, axis = 0) {
  let minV = Number.MAX_VALUE,
    maxV = Number.MIN_VALUE;

  const array = points.geometry.attributes.position.array;

  // Get point depth based on axis
  for (let i = axis; i < array.length; i += 3) {
    if (array[i] < minV) minV = array[i];
    if (array[i] > maxV) maxV = array[i];
  }

  const { minDepth, maxDepth } = guiConfig.points;

  // Generate color array
  const colors = [];

  const minColor = guiConfig.points.minColor.map((v) => v / 255);
  const midColor = guiConfig.points.midColor.map((v) => v / 255);
  const maxColor = guiConfig.points.maxColor.map((v) => v / 255);
  const useMidColor = guiConfig.points.useMidColor;
  const useHsvLerp = guiConfig.points.useHSVLerp;

  const lerpFunction = useHsvLerp ? lerpColorHSV : lerpColor;

  for (let i = axis; i < array.length; i += 3) {
    const pointDepth = inverseLerp(minV, maxV, array[i]);
    const pointValue = lerp(minDepth, maxDepth, pointDepth);
    const pointColor = useMidColor
      ? pointValue <= 0.5
        ? lerpFunction(minColor, midColor, pointValue * 2)
        : lerpFunction(midColor, maxColor, (pointValue - 0.5) * 2)
      : lerpFunction(minColor, maxColor, pointValue);

    colors.push(pointColor[0]); // R
    colors.push(pointColor[1]); // G
    colors.push(pointColor[2]); // B
  }

  return colors;
}

function generatePlanes(rootNode) {
  const planes = [];

  function iterateNodes(node, depth) {
    if (node.nodes && node.nodes.length > 0) {
      const { center, first, second, normal } = node.plane;
      const ra = node.roughness_params.params[0].value;
      planes.push({ center, first, second, normal, depth, ra });
      for (const childNode of node.nodes) {
        iterateNodes(childNode, depth + 1);
      }
    }
  }

  iterateNodes(rootNode, 1);

  return planes;
}

function onMouseMove(event) {
  // calculate mouse position in normalized device coordinates
  // (-1 to +1) for both components

  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

function init() {
  camera = new PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  );
  camera.position.set(10, 7, 10);

  scene = new Scene();
  scene.add(camera);
  camera.lookAt(scene.position);

  clock = new Clock();

  const loader = new XYZLoader();
  loader.load("./Cloud.xyz", function (geometry) {
    geometry.computeBoundingBox();
    geometry.boundingBox.getCenter(cloudCenter);
    geometry.center();

    pointsMaterial = new PointsMaterial({
      size: guiConfig.points.size,
      vertexColors: true,
      sizeAttenuation: true,
    });

    setPointsMaterialGUI();

    points = new Points(geometry, pointsMaterial);
    scene.add(points);

    generatePlanesMeshes();
    //configurePlanesGUI();
    changePlanesVisibility();

    pointsColors = pointCloudColorsByDepth(points, 2);

    geometry.setAttribute("color", new Float32BufferAttribute(pointsColors, 3));
  });

  renderer = new WebGLRenderer();
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  // WINDOW EVENTS
  window.addEventListener("resize", onWindowResize);
  window.addEventListener("mousemove", onMouseMove, false);

  // CONTROLS AND HELPERS
  controls = new OrbitControls(camera, renderer.domElement);
  camera.position.set(0, 0, 10);
  controls.update();

  axesHelper = new AxesHelper(5);
  scene.add(axesHelper);
}

function setPointsMaterialGUI() {
  pointsMaterial.size = guiConfig.points.size;
}

function setPointsVertexColor() {
  points.geometry.setAttribute(
    "color",
    new Float32BufferAttribute(
      pointCloudColorsByDepth(points, guiConfig.points.axis),
      3
    )
  );
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
}

function generatePlanesMeshes() {
  for (const plane of planes) {
    const geometry = new BufferGeometry();

    const ra = plane.ra;
    const center = new Vector3(plane.center.x, plane.center.z, plane.center.y);
    const n = new Vector3(
      plane.normal.x,
      plane.normal.z,
      plane.normal.y
    ).normalize();
    const f = new Vector3(plane.first.x, plane.first.z, plane.first.y);
    const s = new Vector3(plane.second.x, plane.second.z, plane.second.y);

    const df = new Vector3(f.x - center.x, f.y - center.y, f.z - center.z);
    const ds = new Vector3(s.x - center.x, s.y - center.y, s.z - center.z);

    const factor = 1.0 / plane.depth;

    const aP = [
      center.x - df.x * factor - cloudCenter.x + n.x * ra,
      center.y - df.y * factor - cloudCenter.y + n.y * ra,
      center.z - df.z * factor - cloudCenter.z + n.z * ra,
    ];
    const bP = [
      center.x - ds.x * factor - cloudCenter.x + n.x * ra,
      center.y - ds.y * factor - cloudCenter.y + n.y * ra,
      center.z - ds.z * factor - cloudCenter.z + n.z * ra,
    ];
    const cP = [
      center.x + df.x * factor - cloudCenter.x + n.x * ra,
      center.y + df.y * factor - cloudCenter.y + n.y * ra,
      center.z + df.z * factor - cloudCenter.z + n.z * ra,
    ];
    const dP = [
      center.x + ds.x * factor - cloudCenter.x + n.x * ra,
      center.y + ds.y * factor - cloudCenter.y + n.y * ra,
      center.z + ds.z * factor - cloudCenter.z + n.z * ra,
    ];

    const aN = [
      center.x - df.x * factor - cloudCenter.x - +n.x * ra,
      center.y - df.y * factor - cloudCenter.y - +n.y * ra,
      center.z - df.z * factor - cloudCenter.z - +n.z * ra,
    ];
    const bN = [
      center.x - ds.x * factor - cloudCenter.x - n.x * ra,
      center.y - ds.y * factor - cloudCenter.y - n.y * ra,
      center.z - ds.z * factor - cloudCenter.z - n.z * ra,
    ];
    const cN = [
      center.x + df.x * factor - cloudCenter.x - n.x * ra,
      center.y + df.y * factor - cloudCenter.y - n.y * ra,
      center.z + df.z * factor - cloudCenter.z - n.z * ra,
    ];
    const dN = [
      center.x + ds.x * factor - cloudCenter.x - n.x * ra,
      center.y + ds.y * factor - cloudCenter.y - n.y * ra,
      center.z + ds.z * factor - cloudCenter.z - n.z * ra,
    ];

    const vertices = new Float32Array([
      ...aP,
      ...bP,
      ...cP,

      ...cP,
      ...dP,
      ...aP,

      ...aN,
      ...bN,
      ...cN,

      ...cN,
      ...dN,
      ...aN,
    ]);

    // itemSize = 3 because there are 3 values (components) per vertex
    geometry.setAttribute("position", new BufferAttribute(vertices, 3));

    // Color by depth
    //const color = 255 * (1.0 / plane.depth);

    const material = new MeshBasicMaterial({
      color: `rgb(255, 255 , 255)`,
      side: DoubleSide,
      transparent: true,
      opacity: 0.5 + (1.0 / plane.depth) * 0.5,
    });
    const mesh = new Mesh(geometry, material);

    planeMeshes.push({ mesh, visible: true });
  }
}

function configurePlanesGUI() {
  for (const mesh of planeMeshes) {
    gui.add(mesh, "visible").onChange(setMeshes);
  }
}

function changePlanesVisibility() {
  if (guiConfig.planes.visible) {
    for (const mesh of planeMeshes) {
      scene.add(mesh.mesh);
    }
  } else {
    for (const mesh of planeMeshes) {
      scene.remove(mesh.mesh);
    }
  }
}

function animate() {
  requestAnimationFrame(animate);

  controls.update();

  checkMouseOver();

  renderer.render(scene, camera);
}

function checkMouseOver() {
  raycaster.setFromCamera(mouse, camera);

  // create an array containing all objects in the scene with which the ray intersects
  const intersects = raycaster.intersectObjects(
    scene.children.filter((el) => el.type === "Mesh")
  );

  if (intersects.length > 0) {
    if (intersected) {
      if (intersected === intersects[0]) return;
      intersected.material.color.set(intersected.oldHex);
    }
    intersected = intersects[0].object;
    intersected.oldHex = intersected.material.color.getHex();
    intersected.material.color.set(0xff0000);
  } else {
    if (intersected) {
      intersected.material.color.set(intersected.oldHex);
    }
    intersected = null;
  }
}
