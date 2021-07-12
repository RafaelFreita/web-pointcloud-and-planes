import {
  Float32BufferAttribute,
  Vector2,
  Vector3,
  Raycaster,
  PerspectiveCamera,
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
  BackSide,
  FrontSide,
  MeshLambertMaterial,
  AmbientLight,
  PointLight,
  Color,
  Group,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { XYZLoader } from "three/examples/jsm/loaders/XYZLoader.js";
import { ConvexGeometry } from "three/examples/jsm/geometries/ConvexGeometry.js";
import Delaunator from "delaunator";

import axios from "axios";

const SERVER = "http://127.0.0.1:3000";
const MODEL_ID = 1;

const api = axios.create({ baseURL: SERVER });

import { lerp, lerpColor, lerpColorHSV, inverseLerp } from "./color.js";

const gui = new dat.GUI({ name: "My GUI" });

let planes;
function loadPlanes(id) {
  for (const planeMesh of planeMeshes) {
    scene.remove(planeMesh.mesh);
  }
  planeMeshes.length = 0;
  return new Promise((resolve, reject) => {
    api(`${id}/planes`).then((res) => {
      // Cleaning planes
      // Only using EVAL because the data source is reliable.
      // TODO: Change files to JSON instead of JS and use JSON.parse instead of eval
      const planesData = eval(res.data);
      planes = generatePlanes(planesData[0].surface_roughness_data.node);

      generatePlanesMeshes();
      resolve();
      //changePlanesVisibility();
      //configurePlanesGUI();
    });
  });
}

let camera, scene, renderer, axesHelper;
const mouse = new Vector2();
const raycaster = new Raycaster();
let intersected;

const guiConfig = {
  general: {
    model: 1,
  },
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

let availableModels;
api.get("").then((res) => {
  availableModels = res.data;

  const modelsObject = {};
  for (const model of availableModels) {
    modelsObject[model.id] = model.id;
  }

  gui.add(guiConfig.general, "model", modelsObject).onChange(async () => {
    loadModel(guiConfig.general.model);
  });
});

let points,
  pointsColors = [],
  pointsMaterial;
const cloudCenter = new Vector3();
const planeMeshes = [];
const planeControls = [];

let controls;

async function loadModel(id) {
  await loadPlanes(id);
  await loadPoints(id);
}

configureGui();
init();
loadModel(MODEL_ID);

animate();

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

function pointCloudColorsByDepthComparison(points, axis = 0, comparisonValue) {
  // Generate color array
  const colors = [];

  const array = points.geometry.attributes.position.array;

  const minColor = guiConfig.points.minColor.map((v) => v / 255);
  const midColor = guiConfig.points.midColor.map((v) => v / 255);
  const maxColor = guiConfig.points.maxColor.map((v) => v / 255);

  for (let i = axis; i < array.length; i += 3) {
    const pointDepth = array[i];
    const pointValue = comparisonValue - pointDepth;
    const pointColor = pointValue < 0 ? minColor : maxColor;

    colors.push(pointColor[0]); // R
    colors.push(pointColor[1]); // G
    colors.push(pointColor[2]); // B
  }

  return colors;
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

  scene.add(new AmbientLight(0xffffff));

  const light = new PointLight(0xffffff, 1);
  camera.add(light);
}

let mesh;
function loadPoints(id) {
  if (points) scene.remove(points);
  if (mesh) scene.remove(mesh);

  const loader = new XYZLoader();
  return new Promise((resolve, reject) => {
    loader.load(`${SERVER}/${id}/points`, function (geometry) {
      geometry.computeBoundingBox();
      geometry.boundingBox.getCenter(cloudCenter);
      geometry.center();

      // Set planes position
      planesGroup.position.copy(cloudCenter.multiplyScalar(-1));

      pointsMaterial = new PointsMaterial({
        size: guiConfig.points.size,
        vertexColors: true,
        sizeAttenuation: true,
      });

      setPointsMaterialGUI();

      points = new Points(geometry, pointsMaterial);
      setPointsVertexColor();

      scene.add(points);

      // Get vertices from point cloud

      const vertices = [];
      const positionAttribute = geometry.getAttribute("position");

      for (let i = 0; i < positionAttribute.count; i++) {
        const vertex = new Vector3();
        vertex.fromBufferAttribute(positionAttribute, i);
        vertices.push(vertex);
      }

      // Generate mesh

      //const meshGeometry = new BufferGeometry().setFromPoints(vertices);

      // triangulate x, z
      let indexDelaunay;
      if (guiConfig.points.axis === 0) {
        indexDelaunay = Delaunator.from(
          vertices.map((v) => {
            return [v.y, v.z];
          })
        );
      } else if (guiConfig.points.axis === 1) {
        indexDelaunay = Delaunator.from(
          vertices.map((v) => {
            return [v.x, v.z];
          })
        );
      } else {
        indexDelaunay = Delaunator.from(
          vertices.map((v) => {
            return [v.x, v.y];
          })
        );
      }

      var meshIndex = []; // Convert index to ThreeJS index
      for (let i = 0; i < indexDelaunay.triangles.length; i++) {
        meshIndex.push(indexDelaunay.triangles[i]);
      }

      geometry.setIndex(meshIndex); // change indexes in geometry
      geometry.computeVertexNormals();

      // Create material

      const meshMaterial = new MeshLambertMaterial({
        vertexColors: true,
        wireframe: true,
      });

      // const wireframeMaterial = new MeshBasicMaterial({
      //   color: 0xffffff,
      //   wireframe: true,
      //   transparent: true,
      // });

      // Generate geometry

      //var meshGeometry  = new ConvexGeometry(vertices)

      mesh = new Mesh(geometry, meshMaterial);
      // mesh1.material.side = BackSide; // back faces
      // mesh1.renderOrder = 0;
      scene.add(mesh);

      // const mesh2 = new Mesh(meshGeometry, wireframeMaterial.clone());
      // mesh2.material.side = FrontSide; // front faces
      // mesh2.renderOrder = 1;
      // scene.add(mesh2);

      resolve();
    });
  });
}

function setPointsMaterialGUI() {
  pointsMaterial.size = guiConfig.points.size;
}

function setPointsVertexColor() {
  if (planes && planes.length > 0) {
    const accessMapPlane = { 0: "x", 1: "z", 2: "y" };
    const accessMapCloud = { 0: "x", 1: "y", 2: "z" };

    const planeCenter = planes[0].center;
    const planeCenterPos =
      planeCenter[accessMapPlane[guiConfig.points.axis]] +
      cloudCenter[accessMapCloud[guiConfig.points.axis]];

    pointsColors = pointCloudColorsByDepthComparison(
      points,
      guiConfig.points.axis,
      planeCenterPos
    );
  } else {
    pointsColors = pointCloudColorsByDepth(points, guiConfig.points.axis);
  }

  points.geometry.setAttribute(
    "color",
    new Float32BufferAttribute(pointsColors, 3)
  );
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
}

const planesGroup = new Group();
function generatePlanesMeshes() {
  planesGroup.clear();
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
      center.x - df.x * factor + n.x * ra,
      center.y - df.y * factor + n.y * ra,
      center.z - df.z * factor + n.z * ra,
    ];
    const bP = [
      center.x - ds.x * factor + n.x * ra,
      center.y - ds.y * factor + n.y * ra,
      center.z - ds.z * factor + n.z * ra,
    ];
    const cP = [
      center.x + df.x * factor + n.x * ra,
      center.y + df.y * factor + n.y * ra,
      center.z + df.z * factor + n.z * ra,
    ];
    const dP = [
      center.x + ds.x * factor + n.x * ra,
      center.y + ds.y * factor + n.y * ra,
      center.z + ds.z * factor + n.z * ra,
    ];

    const aN = [
      center.x - df.x * factor - n.x * ra,
      center.y - df.y * factor - n.y * ra,
      center.z - df.z * factor - n.z * ra,
    ];
    const bN = [
      center.x - ds.x * factor - n.x * ra,
      center.y - ds.y * factor - n.y * ra,
      center.z - ds.z * factor - n.z * ra,
    ];
    const cN = [
      center.x + df.x * factor - n.x * ra,
      center.y + df.y * factor - n.y * ra,
      center.z + df.z * factor - n.z * ra,
    ];
    const dN = [
      center.x + ds.x * factor - n.x * ra,
      center.y + ds.y * factor - n.y * ra,
      center.z + ds.z * factor - n.z * ra,
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
    planesGroup.add(mesh);
  }

  scene.add(planesGroup);
}

function configurePlanesGUI() {
  for (const mesh of planeMeshes) {
    gui.add(mesh, "visible").onChange(setMeshes);
  }
}

function changePlanesVisibility() {
  console.log("Change visibility to", guiConfig.planes.visible);
  if (guiConfig.planes.visible) {
    scene.add(planesGroup);
  } else {
    scene.remove(planesGroup);
  }
}

function animate() {
  requestAnimationFrame(animate);

  controls.update();

  checkMouseOver();

  renderer.render(scene, camera);
}

function checkMouseOver() {
  // raycaster.setFromCamera(mouse, camera);
  // // create an array containing all objects in the scene with which the ray intersects
  // const intersects = raycaster.intersectObjects(
  //   scene.children.filter((el) => el.type === "Mesh")
  // );
  // if (intersects.length > 0) {
  //   if (intersected) {
  //     if (intersected === intersects[0]) return;
  //     intersected.material.color.set(intersected.oldHex);
  //   }
  //   intersected = intersects[0].object;
  //   intersected.oldHex = intersected.material.color.getHex();
  //   intersected.material.color.set(0xff0000);
  // } else {
  //   if (intersected) {
  //     intersected.material.color.set(intersected.oldHex);
  //   }
  //   intersected = null;
  // }
}
