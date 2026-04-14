import * as THREE from "three";
import * as CANNON from "cannon-es";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { FontLoader } from "three/examples/jsm/loaders/FontLoader.js";
import { TextGeometry } from "three/examples/jsm/geometries/TextGeometry.js";
import fontJSON from "three/examples/fonts/droid/droid_sans_regular.typeface.json";
import gsap from "gsap";
import snowVertexShader from "./shaders/snow/vertex.glsl";
import snowFragmentShader from "./shaders/snow/fragment.glsl";
import titleVertexShader from "./shaders/title/vertex.glsl";
import titleFragmentShader from "./shaders/title/fragment.glsl";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";

/*-- Constants --*/

const OBJECT_TYPES = {
	Pig: "pig",
	Box_Stone: "stone",
	Box_Wood: "wood",
	Box_Ice: "ice",
	Bird: "bird",
};

const HEALTH = { pig: 25, wood: 50, stone: 75, ice: 25, bird: 100 };
const MASS = { pig: 1, wood: 2, stone: 3, ice: 1, bird: 1 };

const STAR_THRESHOLDS = [0.175, 0.5, 0.825];
const SLINGSHOT_POS = new THREE.Vector3(27.5, 6.75, 0);
const SKY_COLOR = new THREE.Color(0x5aaee8);

const SHOOT_FORCE = 40;
const MIN_IMPACT = 2;
const MAX_PULL = 4;
const SHOOT_ARC = 0.25;
const WAKE_RADIUS_SQ = 100;
const SNOW_COUNT = 3000;
const SNOW_AREA = 300;
const SNOW_HEIGHT = 120;

/*-- Game --*/

class Game {
	constructor() {
		this.initDOM();
		this.initSound();
		this.initData();
		this.initScene();
		this.initPhysics();
		this.initLoaders();
		this.boundLoop = this.loop.bind(this);
	}

	/*-- Init --*/

	initDOM() {
		const $ = (id) => document.getElementById(id);
		const $$ = (sel) => document.querySelectorAll(sel);

		this.elements = {
			canvas: $("webgl"),
			loader: $("loader"),
			loaderProgress: $("loader-progress"),
			loaderInner: $("loader-inner"),
			loaderText: $("loader-text"),
			loaderPercent: $("loader-percent"),
			loaderClick: $("loader-click"),
			select: $("select"),
			selectBtns: $$(".select-btn"),
			soundBtn: $("sound-btn"),
			fullscreenBtn: $("fullscreen-btn"),
			fullscreenIcons: $$(".fullscreen"),
			zoomSpans: $$("#zoom span"),
			powerSpans: $$("#power span"),
			closeBtn: $("close-btn"),
			homes: $$(".home"),
			levels: $$(".level"),
			levelNumber: $("level-number"),
			birdsLeft: $("birds-left"),
			pigsLeft: $("pigs-left"),
			destructionProgress: $("destruction-progress"),
			destructionStars: $$(".destruction-star"),
			totalStars: $("stars-total"),
			win: $("win"),
			lose: $("lose"),
		};
	}

	initSound() {
		this.allSounds = [];

		const audio = (src, volume = 1, loop = false) => {
			const a = new Audio(src);
			a.volume = volume;
			a.loop = loop;
			this.allSounds.push(a);
			return a;
		};

		this.sounds = {
			add: audio("/sounds/add.wav"),
			music: audio("/sounds/music.mp3", 0.35, true),
			random: [
				audio("/sounds/random/crow.mp3"),
				audio("/sounds/random/ice.mp3", 0.1),
				audio("/sounds/random/owl.mp3"),
				audio("/sounds/random/birds.mp3"),
			],
			bird: {
				add: audio("/sounds/bird/add.wav"),
				collide: audio("/sounds/bird/collide.wav"),
				destroy: audio("/sounds/bird/destroy.wav"),
			},
			pig: {
				add: audio("/sounds/pig/add.wav"),
				collide: audio("/sounds/pig/collide.wav"),
				destroy: audio("/sounds/pig/destroy.wav"),
			},
			wood: {
				collide: audio("/sounds/wood/collide.wav"),
				destroy: audio("/sounds/wood/destroy.wav"),
			},
			stone: {
				collide: audio("/sounds/stone/collide.wav"),
				destroy: audio("/sounds/stone/destroy.wav"),
			},
			ice: {
				collide: audio("/sounds/ice/collide.wav"),
				destroy: audio("/sounds/ice/destroy.wav"),
			},
			slingshot: {
				shoot: audio("/sounds/slingshot/shoot.wav"),
				stretch: audio("/sounds/slingshot/stretch.wav"),
			},
			result: {
				win: audio("/sounds/result/win.wav"),
				lose: audio("/sounds/result/lose.wav"),
			},
			ui: {
				click: audio("/sounds/ui/click.wav"),
				disabled: audio("/sounds/ui/disabled.wav"),
				hover: audio("/sounds/ui/hover.wav"),
			},
		};
	}

	initData() {
		this.sizes = { width: window.innerWidth, height: window.innerHeight };
		this.prevTime = 0;
		this.vec3 = new THREE.Vector3();

		this.isSound = false;
		this.isCamMove = false;
		this.isLoaded = false;
		this.isPlay = false;
		this.isDrag = false;
		this.isEnding = false;

		this.cursor = { x: 0, y: 0 };
		this.dragStart = { x: 0, y: 0 };
		this.pullVector = null;

		this.zoomTarget = 1;
		this.lastZoomSpan = -1;
		this.lastPowerSpan = -1;
		this.camTarget = new THREE.Vector3(2, 3, -6);
		this.camTargetBase = null;

		this.snow = null;
		this.title = null;
		this.subtitle = null;

		this.slingLeft = null;
		this.slingRight = null;
		this.slingMat = null;
		this.slingEndPos = new THREE.Vector3();

		this.levels = { 1: [], 2: [], 3: [] };
		this.stars = { 1: 0, 2: 0, 3: 0 };

		this.resetLevelState();
	}

	initScene() {
		this.scene = new THREE.Scene();
		this.scene.fog = new THREE.Fog(SKY_COLOR, 1, 400);

		this.camera = new THREE.PerspectiveCamera(
			45,
			this.sizes.width / this.sizes.height,
			1,
			500,
		);
		this.camera.position.set(36, 3, 40);
		this.camera.lookAt(this.camTarget);
		this.scene.add(this.camera);

		this.renderer = new THREE.WebGLRenderer({
			canvas: this.elements.canvas,
			antialias: true,
			powerPreference: "high-performance",
		});
		this.renderer.outputColorSpace = THREE.SRGBColorSpace;
		this.renderer.shadowMap.enabled = true;
		this.renderer.setClearColor(SKY_COLOR);
		this.updateRenderer();
	}

	updateRenderer() {
		this.renderer.setSize(this.sizes.width, this.sizes.height);
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
	}

	initPhysics() {
		this.world = new CANNON.World({
			gravity: new CANNON.Vec3(0, -9.82, 0),
		});
		this.world.broadphase = new CANNON.SAPBroadphase(this.world);
		this.world.allowSleep = true;
	}

	initLoaders() {
		this.loadingManager = new THREE.LoadingManager(
			() => (this.isLoaded = true),
		);
		this.gltfLoader = new GLTFLoader(this.loadingManager);
		this.fontLoader = new FontLoader(this.loadingManager);
	}

	/*-- Entry --*/

	init() {
		this.initLights();
		this.initSnow();
		this.initTitle();
		this.initSlingshot();
		this.initEvents();
		this.initModel();
		this.loop();
		this.boot();
	}

	initLights() {
		this.scene.add(new THREE.AmbientLight(0x8ecae6, 0.45));

		const sun = new THREE.DirectionalLight(0xfff5c2, 0.9);
		sun.position.set(80, 50, -40);
		sun.castShadow = true;
		sun.shadow.mapSize.set(2048, 2048);
		sun.shadow.camera.near = 10;
		sun.shadow.camera.far = 260;
		sun.shadow.camera.right = 180;
		sun.shadow.camera.left = -100;
		sun.shadow.camera.top = 110;
		sun.shadow.camera.bottom = -50;
		sun.shadow.bias = -0.002;
		sun.shadow.normalBias = 0.02;
		sun.shadow.radius = 2;
		this.scene.add(sun);
	}

	initSnow() {
		const positions = new Float32Array(SNOW_COUNT * 3);
		const speeds = new Float32Array(SNOW_COUNT);
		const winds = new Float32Array(SNOW_COUNT);
		const sizes = new Float32Array(SNOW_COUNT);

		for (let i = 0; i < SNOW_COUNT; i++) {
			positions[i * 3] = (Math.random() - 0.5) * SNOW_AREA - 100;
			positions[i * 3 + 1] = Math.random() * SNOW_HEIGHT;
			positions[i * 3 + 2] = (Math.random() - 0.5) * SNOW_AREA;
			speeds[i] = 1 + Math.random() * 2;
			winds[i] = Math.random() * Math.PI * 2;
			sizes[i] = 1 + Math.random();
		}

		const geo = new THREE.BufferGeometry();
		geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
		geo.setAttribute("aSpeed", new THREE.BufferAttribute(speeds, 1));
		geo.setAttribute("aWind", new THREE.BufferAttribute(winds, 1));
		geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));

		this.snow = new THREE.Points(
			geo,
			new THREE.ShaderMaterial({
				precision: "lowp",
				uniforms: { uTime: { value: 0 } },
				vertexShader: snowVertexShader,
				fragmentShader: snowFragmentShader,
				depthWrite: false,
				transparent: true,
			}),
		);
		this.snow.frustumCulled = false;
		this.scene.add(this.snow);
	}

	initTitle() {
		const group = new THREE.Group();
		group.rotation.y = Math.PI * 0.5;
		group.position.set(-400, 160, 0);
		this.scene.add(group);

		const font = this.fontLoader.parse(fontJSON);

		this.subtitle = new THREE.Mesh(
			new TextGeometry("* Christmas Edition *", {
				font,
				size: 8,
				depth: 0,
				curveSegments: 1,
			}),
			new THREE.MeshBasicMaterial({ color: SKY_COLOR, fog: false }),
		);
		this.subtitle.position.set(-115, 45, 0);
		group.add(this.subtitle);

		const titleGeo = new TextGeometry("Angry Birds", {
			font,
			size: 42,
			depth: 0,
			curveSegments: 1,
		});
		titleGeo.computeBoundingBox();
		titleGeo.translate(
			-(titleGeo.boundingBox.max.x - titleGeo.boundingBox.min.x) * 0.5,
			0,
			0,
		);

		this.title = new THREE.Mesh(
			titleGeo,
			new THREE.ShaderMaterial({
				precision: "lowp",
				uniforms: { uFade: { value: 0 } },
				vertexShader: titleVertexShader,
				fragmentShader: titleFragmentShader,
				transparent: true,
			}),
		);
		group.add(this.title);
	}

	initSlingshot() {
		const { x, y } = SLINGSHOT_POS;

		const makeGeo = (z) => {
			const geo = new LineGeometry();
			geo.setPositions([x, y, z, x, y, 0]);
			return geo;
		};

		this.slingMat = new LineMaterial({
			color: 0x000000,
			linewidth: 0.25,
			worldUnits: true,
		});
		this.updateSlingshotResolution();

		this.slingLeft = new Line2(makeGeo(1.5), this.slingMat);
		this.slingRight = new Line2(makeGeo(-1.5), this.slingMat);
		this.scene.add(this.slingLeft, this.slingRight);
	}

	updateSlingshotResolution() {
		const dpr = Math.min(window.devicePixelRatio, 2);
		this.slingMat.resolution.set(
			this.sizes.width * dpr,
			this.sizes.height * dpr,
		);
	}

	updateSlingshot() {
		const { x, y, z } = this.activeBird.position;
		const { x: sx, y: sy } = SLINGSHOT_POS;
		this.slingLeft.geometry.setPositions([sx, sy, 1.5, x, y, z]);
		this.slingRight.geometry.setPositions([sx, sy, -1.5, x, y, z]);
		this.slingEndPos.set(x, y, z);
	}

	releaseSlingshot() {
		const endL = this.slingEndPos.clone();
		const endR = this.slingEndPos.clone();
		const { x: sx, y: sy } = SLINGSHOT_POS;

		const animate = (end, z, geo) =>
			gsap.to(end, {
				x: SLINGSHOT_POS.x,
				y: SLINGSHOT_POS.y,
				z: SLINGSHOT_POS.z,
				duration: 1,
				ease: "elastic.out(1, 0.5)",
				onUpdate: () => geo.setPositions([sx, sy, z, end.x, end.y, end.z]),
			});

		animate(endL, 1.5, this.slingLeft.geometry);
		animate(endR, -1.5, this.slingRight.geometry);
	}

	initEvents() {
		window.addEventListener("resize", () => this.onResize());
		document.addEventListener("mousemove", (e) => this.onMouseMove(e));
		window.addEventListener("mousedown", (e) => this.onMouseDown(e));
		window.addEventListener("mouseup", () => this.onMouseUp());
		window.addEventListener("wheel", (e) => this.onWheel(e), { passive: true });

		document.addEventListener("visibilitychange", () => {
			if (document.hidden) this.soundOff();
			else if (this.isSound) this.sounds.music.play().catch(() => {});
		});

		this.elements.fullscreenBtn.addEventListener("click", () => {
			if (document.fullscreenElement) document.exitFullscreen();
			else document.documentElement.requestFullscreen();
			this.elements.fullscreenIcons.forEach((f) =>
				f.classList.toggle("active"),
			);
			this.playSound(this.sounds.ui.click);
		});

		this.elements.soundBtn.addEventListener("click", () => this.toggleSound());

		this.elements.selectBtns.forEach((btn) => {
			btn.addEventListener("mouseenter", () => {
				if (!btn.classList.contains("locked"))
					this.playSound(this.sounds.ui.hover);
			});
			btn.addEventListener("click", () => {
				if (btn.classList.contains("locked")) {
					this.playSound(this.sounds.ui.disabled);
					return;
				}
				this.playSound(this.sounds.ui.click);
				this.changeToLevel(parseInt(btn.dataset.level));
			});
		});

		this.elements.closeBtn.addEventListener("mouseenter", () =>
			this.playSound(this.sounds.ui.hover),
		);

		this.elements.closeBtn.addEventListener("click", () => {
			this.playSound(this.sounds.ui.click);
			this.changeToHome();
		});
	}

	onResize() {
		this.sizes.width = window.innerWidth;
		this.sizes.height = window.innerHeight;
		this.camera.aspect = this.sizes.width / this.sizes.height;
		this.camera.updateProjectionMatrix();
		this.updateSlingshotResolution();
		this.updateRenderer();
	}

	onMouseMove(e) {
		if (this.isCamMove) {
			this.cursor.x = e.clientX / this.sizes.width - 0.5;
			this.cursor.y = e.clientY / this.sizes.height - 0.5;
		}

		if (!this.isDrag || !this.activeBird) return;

		this.pullVector = {
			x: this.clamp((e.clientX - this.dragStart.x) / 300, -1, 1),
			y: this.clamp((e.clientY - this.dragStart.y) / 300, 0, 1),
		};

		const active = Math.round(this.pullVector.y * 10);
		if (active !== this.lastPowerSpan) {
			this.elements.powerSpans.forEach((s, i) =>
				s.classList.toggle("active", i < active),
			);
			this.lastPowerSpan = active;
		}
	}

	onMouseDown(e) {
		if (!this.isPlay || !this.activeBird || e.target.closest("button")) return;
		document.body.classList.replace("pointer", "grabbing");
		this.playSound(this.sounds.slingshot.stretch);
		this.isDrag = true;
		this.dragStart = { x: e.clientX, y: e.clientY };
		this.pullVector = null;
	}

	onMouseUp() {
		if (!this.isDrag) return;
		document.body.classList.remove("grabbing");
		this.isDrag = false;

		if (this.pullVector?.y > 0.2) {
			this.playSound(this.sounds.slingshot.shoot);
			this.shootBird(this.pullVector);
		} else if (this.activeBird) {
			this.snapBirdToSlingshot();
		}

		this.pullVector = null;
		this.elements.powerSpans.forEach((s) => s.classList.remove("active"));
		this.lastPowerSpan = -1;
	}

	onWheel(e) {
		if (!this.isCamMove) return;
		this.zoomTarget = this.clamp(this.zoomTarget + e.deltaY * -0.001, 1, 4);
	}

	snapBirdToSlingshot() {
		document.body.classList.add("pointer");
		gsap.to(this.activeBird.position, {
			x: SLINGSHOT_POS.x,
			y: SLINGSHOT_POS.y,
			z: SLINGSHOT_POS.z,
			duration: 0.25,
			ease: "back.out(1.7)",
			onUpdate: () => {
				const body = this.activeBird?.userData.body;
				if (body) this.syncBodyToMesh(body, this.activeBird);
				this.updateSlingshot();
			},
		});
	}

	/*-- Helpers --*/

	clamp(val, min, max) {
		return Math.min(Math.max(val, min), max);
	}

	wait(ms) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	syncBodyToMesh(body, mesh) {
		body.position.set(mesh.position.x, mesh.position.y, mesh.position.z);
	}

	/*-- Sound --*/

	playSound(sound) {
		if (!sound || !this.isSound || document.hidden) return;
		sound.currentTime = 0;
		sound.play().catch(() => {});
	}

	pauseSound(sound) {
		if (!sound) return;
		sound.pause();
		sound.currentTime = 0;
	}

	toggleSound() {
		this.isSound = !this.isSound;
		this.elements.soundBtn.classList.toggle("active", this.isSound);
		if (this.isSound) {
			this.soundOn();
			this.playSound(this.sounds.ui.click);
		} else {
			this.soundOff();
		}
	}

	soundOn() {
		this.sounds.music.play().catch(() => {});
	}

	soundOff() {
		this.allSounds.forEach((s) => {
			s.pause();
			if (!s.loop) s.currentTime = 0;
		});
	}

	initRandomSounds() {
		this.sounds.random.forEach((s) => {
			const schedule = () =>
				setTimeout(
					() => {
						if (this.isSound && !document.hidden) s.play().catch(() => {});
						schedule();
					},
					20000 + Math.random() * 30000,
				);
			schedule();
		});
	}

	/*-- Model --*/

	initModel() {
		this.gltfLoader.load("/models/angrybirds.glb", (gltf) => {
			const root = gltf.scene.children[0];

			root.traverse((obj) => {
				if (!obj.isMesh) return;

				const mats = Array.isArray(obj.material)
					? obj.material
					: [obj.material];
				mats.forEach((m) => {
					m.flatShading = true;
					m.needsUpdate = true;
				});

				if (obj.name === "Ground") {
					obj.receiveShadow = true;
					const body = new CANNON.Body({ shape: new CANNON.Plane() });
					body.quaternion.setFromEuler(-Math.PI * 0.5, 0, 0);
					this.world.addBody(body);
					return;
				}

				obj.castShadow = true;
				obj.receiveShadow = true;
			});

			const take = (name) => {
				const obj = root.getObjectByName(name);
				if (!obj) return { children: [] };
				root.remove(obj);
				return obj;
			};

			this.levels[1] = [...take("Level_1").children];
			this.levels[2] = [...take("Level_2").children];
			this.levels[3] = [...take("Level_3").children];
			this.birds = [...take("Birds").children];

			[
				...this.birds,
				...this.levels[1],
				...this.levels[2],
				...this.levels[3],
			].forEach((obj) => {
				obj.userData.origin = {
					position: obj.position.clone(),
					quaternion: obj.quaternion.clone(),
				};
			});

			this.scene.add(root);
		});
	}

	/*-- Boot --*/

	async boot() {
		await this.wait(1000);
		this.setProgress(0.29);
		await this.wait(1500);
		this.setProgress(0.67);
		await this.wait(1500);

		while (!this.isLoaded) await this.wait(50);

		this.setProgress(1);
		await this.wait(1000);

		this.elements.loaderClick.classList.add("show");
		this.elements.loaderText.classList.add("hide");
		document.body.classList.add("pointer");

		await this.waitForClick();

		this.elements.loaderInner.classList.add("hide");
		document.body.classList.remove("pointer");
		await this.wait(500);

		this.elements.loader.classList.add("hide");
		await this.animateCamera(60, 4, 0, 0, 11, 0);
		this.elements.loader.classList.add("remove");

		await this.showTitle();
		this.enableCamMove();
		this.stagger(this.elements.homes, true);
	}

	waitForClick() {
		return new Promise((resolve) => {
			document.addEventListener(
				"click",
				() => {
					this.toggleSound();
					this.initRandomSounds();
					resolve();
				},
				{ once: true },
			);
		});
	}

	async stagger(elements, show) {
		const n = elements.length;
		for (let i = 0; i < n; i++) {
			elements[show ? i : n - 1 - i].classList.toggle("show", show);
			await this.wait(100);
		}
	}

	setProgress(value) {
		this.elements.loaderProgress.style.setProperty("--s", value);
		const from = parseFloat(this.elements.loaderPercent.textContent) || 0;
		const to = value * 100;
		const el = this.elements.loaderPercent;
		gsap.to(
			{ v: from },
			{
				v: to,
				duration: 0.5,
				ease: "none",
				onUpdate() {
					el.textContent = Math.round(this.targets()[0].v) + "%";
				},
			},
		);
	}

	/*-- Camera --*/

	animateCamera(camX, camY, camZ, tarX, tarY, tarZ) {
		return new Promise((resolve) => {
			const tl = gsap.timeline({ onComplete: resolve });
			tl.to(
				this.camera.position,
				{ x: camX, y: camY, z: camZ, duration: 3, ease: "power1.inOut" },
				0,
			);
			tl.to(
				this.camTarget,
				{
					x: tarX,
					y: tarY,
					z: tarZ,
					duration: 3,
					ease: "power1.inOut",
					onUpdate: () => this.camera.lookAt(this.camTarget),
				},
				0,
			);
		});
	}

	enableCamMove(enable = true) {
		this.isCamMove = enable;
		if (enable) this.camTargetBase = this.camTarget.clone();
	}

	resetZoom() {
		this.zoomTarget = 1;
		this.lastZoomSpan = -1;
		this.elements.zoomSpans.forEach((z) => z.classList.remove("active"));
		gsap.to(this.camera, {
			zoom: 1,
			duration: 1,
			ease: "power1.inOut",
			onUpdate: () => this.camera.updateProjectionMatrix(),
		});
	}

	/*-- Title --*/

	showTitle(show = true) {
		return new Promise((resolve) => {
			const tl = gsap.timeline({ onComplete: resolve });
			tl.to(
				this.title.material.uniforms.uFade,
				{ value: show ? 1 : 0, duration: 1, ease: "power1.inOut" },
				0,
			);
			tl.to(
				this.subtitle.material.color,
				{
					r: show ? 1 : SKY_COLOR.r,
					g: show ? 1 : SKY_COLOR.g,
					b: show ? 1 : SKY_COLOR.b,
					duration: 1,
					ease: "power1.inOut",
				},
				0,
			);
			tl.to(
				this.subtitle.position,
				{ y: show ? 40 : 45, duration: 1, ease: "power1.inOut" },
				0,
			);
		});
	}

	/*-- Level --*/

	async changeToLevel(id) {
		gsap.to(this.sounds.music, { volume: 0.1, duration: 1 });
		this.showTitle(false);
		this.elements.select.classList.remove("show");
		this.setupLevel(id);
		this.enableCamMove(false);
		this.resetZoom();
		await this.animateCamera(50, 13, 0, 0, 6, 0);
		this.enableCamMove(true);
		this.stagger(this.elements.levels, true);
	}

	async changeToHome() {
		clearTimeout(this.resultTimeout);
		this.elements.win.classList.remove("show");
		this.elements.lose.classList.remove("show");
		this.pauseSound(this.sounds.result.win);
		this.pauseSound(this.sounds.result.lose);

		if (this.pigsCleared && this.currentLevel) {
			this.updateStars(Math.min(this.levelDamage / this.levelHealth, 1));
		}

		gsap.to(this.sounds.music, { volume: 0.35, duration: 1 });
		this.showTitle();
		this.stagger(this.elements.levels, false);
		this.removeLevel();
		this.enableCamMove(false);
		this.resetZoom();
		await this.animateCamera(60, 4, 0, 0, 11, 0);
		this.enableCamMove(true);
		this.elements.select.classList.add("show");
	}

	resetLevelState() {
		this.currentLevel = null;
		this.levelHealth = 0;
		this.levelDamage = 0;
		this.pigs = [];
		this.boxes = [];
		this.physicsObjects = [];
		this.activeBird = null;
		this.activeBirdIndex = 0;
		this.pigsCleared = false;
		this.isEnding = false;
		this.bodiesToRemove = [];
		this.objectsToDestroy = [];
		this.resultTimeout = null;
	}

	async setupLevel(id) {
		this.currentLevel = id;
		this.activeBirdIndex = 0;
		this.activeBird = null;
		this.pigs = [];
		this.boxes = [];
		this.physicsObjects = [];
		this.levelDamage = 0;
		this.pigsCleared = false;
		this.isEnding = false;

		this.elements.levelNumber.textContent = this.currentLevel;

		this.levelHealth = this.levels[id].reduce((total, obj) => {
			const type = this.getType(obj.name);
			return type ? total + HEALTH[type] : total;
		}, 0);

		await this.wait(500);

		await Promise.all(
			this.birds.map(
				(bird, i) =>
					new Promise((resolve) => this.spawnObj(bird, "bird", i, resolve)),
			),
		);

		await this.wait(500);

		await Promise.all(
			this.levels[id].map(
				(obj, i) =>
					new Promise((resolve) => {
						const type = this.getType(obj.name);
						if (!type) {
							resolve();
							return;
						}
						if (type === "pig") this.pigs.push(obj);
						else this.boxes.push(obj);
						this.spawnObj(obj, type, i, resolve);
					}),
			),
		);

		this.physicsObjects = [...this.pigs, ...this.boxes];

		this.updateStats();
		this.updateDestruction();
		this.isPlay = true;
		this.prepareBird();
	}

	spawnObj(obj, type, i, done = null) {
		obj.userData.dead = false;
		obj.userData.health = HEALTH[type];
		obj.userData.type = type;
		obj.position.copy(obj.userData.origin.position);
		obj.quaternion.copy(obj.userData.origin.quaternion);
		obj.scale.set(0, 0, 0);
		this.scene.add(obj);
		this.animateObj(obj, true, i, () => done?.());
		this.playSound(this.sounds[type]?.add ?? this.sounds.add);
	}

	getType(name) {
		for (const [prefix, type] of Object.entries(OBJECT_TYPES)) {
			if (name.startsWith(prefix)) return type;
		}
		return null;
	}

	async removeLevel() {
		this.isPlay = false;

		this.bodiesToRemove.forEach((b) => this.world.removeBody(b));
		this.bodiesToRemove = [];
		this.objectsToDestroy = [];

		await Promise.all(
			[...this.physicsObjects, ...this.birds].map(
				(obj, i) =>
					new Promise((resolve) => {
						if (obj.userData.body) {
							this.world.removeBody(obj.userData.body);
							obj.userData.body = null;
						}
						obj.userData.dead = false;
						this.animateObj(obj, false, i, () => {
							this.scene.remove(obj);
							resolve();
						});
					}),
			),
		);

		this.resetLevelState();
	}

	animateObj(obj, show, i, done = null) {
		gsap.to(obj.scale, {
			x: show ? 1 : 0,
			y: show ? 1 : 0,
			z: show ? 1 : 0,
			duration: 0.25,
			delay: i * 0.1,
			ease: show ? "back.out(1.7)" : "back.in(1.7)",
			onComplete: done,
		});
	}

	/*-- Ui --*/

	updateStats() {
		this.elements.birdsLeft.textContent =
			this.birds.length - this.activeBirdIndex;
		this.elements.pigsLeft.textContent = this.pigs.length;
	}

	updateDestruction() {
		const ratio =
			this.levelHealth > 0
				? Math.min(this.levelDamage / this.levelHealth, 1)
				: 0;
		this.elements.destructionProgress.style.setProperty("--s", ratio);
		this.elements.destructionStars.forEach((star, i) =>
			star.classList.toggle("active", ratio >= STAR_THRESHOLDS[i]),
		);
	}

	updateStars(destruction) {
		if (!this.pigsCleared) return;

		const earned = STAR_THRESHOLDS.filter((t) => destruction >= t).length;
		if (earned > this.stars[this.currentLevel]) {
			this.stars[this.currentLevel] = earned;
		}

		this.elements.totalStars.textContent = Object.values(this.stars).reduce(
			(a, b) => a + b,
			0,
		);

		const next = this.currentLevel + 1;
		const nextBtn = this.elements.selectBtns[next - 1];
		if (this.stars[this.currentLevel] >= 1 && this.levels[next] && nextBtn) {
			nextBtn.classList.remove("locked");
		}

		const btn = this.elements.selectBtns[this.currentLevel - 1];
		btn
			?.querySelectorAll(".select-btn-star")
			.forEach((star, i) =>
				star.classList.toggle("active", i < this.stars[this.currentLevel]),
			);
	}

	showResult(win) {
		const key = win ? "win" : "lose";
		this.playSound(this.sounds.result[key]);
		const el = this.elements[key];
		el.classList.add("show");
		this.resultTimeout = setTimeout(() => {
			el.classList.remove("show");
			this.resultTimeout = setTimeout(() => this.changeToHome(), 1000);
		}, 4000);
	}

	/*-- Physics --*/

	activateLevelPhysics() {
		this.physicsObjects.forEach((obj) =>
			this.createBody(obj, obj.userData.type),
		);
	}

	createBody(obj, type) {
		const isSphere = type === "pig" || type === "bird";
		let shape;

		if (isSphere) {
			shape = new CANNON.Sphere(0.5);
		} else {
			obj.geometry.computeBoundingBox();
			obj.geometry.boundingBox.getSize(this.vec3);
			shape = new CANNON.Box(
				new CANNON.Vec3(
					this.vec3.x * 0.5,
					this.vec3.y * 0.5,
					this.vec3.z * 0.5,
				),
			);
		}

		const body = new CANNON.Body({
			mass: 0,
			type: CANNON.Body.STATIC,
			shape,
			linearDamping: 0.3,
			angularDamping: 0.3,
		});

		obj.getWorldPosition(this.vec3);
		body.position.set(this.vec3.x, this.vec3.y, this.vec3.z);
		body.allowSleep = true;
		body.sleepSpeedLimit = 0.2;
		body.sleepTimeLimit = 0.8;

		obj.userData.body = body;
		body.userData = { obj };

		body.addEventListener("collide", (e) => {
			const impact = e.contact.getImpactVelocityAlongNormal();
			if (Math.abs(impact) < MIN_IMPACT) return;
			const dmg = Math.abs(impact) * 4;
			this.damage(obj, dmg);
			if (e.body.userData?.obj) this.damage(e.body.userData.obj, dmg * 0.5);
			this.playSound(this.sounds[type]?.collide);
		});

		this.world.addBody(body);

		if (type !== "bird") {
			setTimeout(() => {
				if (!obj.userData.body) return;
				body.type = CANNON.Body.DYNAMIC;
				body.mass = MASS[type];
				body.updateMassProperties();
				body.wakeUp();
			}, 500);
		}
	}

	damage(obj, amount) {
		if (!obj.userData.health || obj.userData.dead) return;
		if (obj === this.activeBird) return;

		obj.userData.health -= amount;

		if (obj.userData.type !== "bird") {
			this.levelDamage += amount;
			this.updateDestruction();
		}

		if (obj.userData.health <= 0) {
			obj.userData.dead = true;
			this.objectsToDestroy.push(obj);
		}
	}

	destroy(obj) {
		const body = obj.userData.body;

		if (body) {
			const { x: px, y: py, z: pz } = body.position;
			this.world.bodies.forEach((b) => {
				if (b === body) return;
				const dx = b.position.x - px;
				const dy = b.position.y - py;
				const dz = b.position.z - pz;
				if (dx * dx + dy * dy + dz * dz < WAKE_RADIUS_SQ) b.wakeUp();
			});
			this.bodiesToRemove.push(body);
			obj.userData.body = null;
		}

		this.playSound(this.sounds[obj.userData.type]?.destroy);

		this.pigs = this.pigs.filter((o) => o !== obj);
		this.boxes = this.boxes.filter((o) => o !== obj);
		this.physicsObjects = this.physicsObjects.filter((o) => o !== obj);

		this.animateObj(obj, false, 0, () => this.scene.remove(obj));
		this.updateStats();
		this.checkEnd();
	}

	/*-- Bird --*/

	prepareBird() {
		if (this.activeBirdIndex >= this.birds.length) return;

		const bird = this.birds[this.activeBirdIndex];
		this.activeBird = bird;
		this.createBody(bird, "bird");
		document.body.classList.add("pointer");

		gsap.to(bird.position, {
			x: SLINGSHOT_POS.x,
			y: SLINGSHOT_POS.y,
			z: SLINGSHOT_POS.z,
			duration: 0.5,
			ease: "back.out(1.7)",
			onUpdate: () => {
				const body = bird.userData.body;
				if (body) this.syncBodyToMesh(body, bird);
			},
		});
	}

	shootBird(vector) {
		if (!this.activeBird) return;

		const body = this.activeBird.userData.body;
		if (!body) return;

		if (this.activeBirdIndex === 0) this.activateLevelPhysics();

		document.body.classList.remove("grabbing");

		body.type = CANNON.Body.DYNAMIC;
		body.mass = MASS.bird;
		body.updateMassProperties();
		body.wakeUp();

		this.vec3.subVectors(SLINGSHOT_POS, this.activeBird.position).normalize();
		const force = vector.y * SHOOT_FORCE;

		body.applyLocalImpulse(
			new CANNON.Vec3(
				this.vec3.x * force,
				(this.vec3.y + SHOOT_ARC) * force,
				this.vec3.z * force,
			),
			new CANNON.Vec3(0, 0, 0),
		);

		this.releaseSlingshot();
		this.physicsObjects.push(this.activeBird);
		this.activeBird = null;
		this.activeBirdIndex++;
		this.updateStats();

		setTimeout(() => {
			if (this.activeBirdIndex < this.birds.length) this.prepareBird();
			else this.checkEnd();
		}, 2000);
	}

	/*-- Result --*/

	checkEnd() {
		if (this.pigs.length === 0 && !this.pigsCleared) {
			this.pigsCleared = true;
			if (this.activeBirdIndex < this.birds.length) return;
		}

		if (
			this.activeBirdIndex >= this.birds.length &&
			!this.activeBird &&
			!this.isEnding
		) {
			this.isEnding = true;
			this.waitForSleep();
		}
	}

	waitForSleep() {
		const anyAwake = this.physicsObjects.some(
			(obj) => obj.userData.body?.sleepState !== CANNON.Body.SLEEPING,
		);

		if (anyAwake) {
			this.resultTimeout = setTimeout(() => this.waitForSleep(), 50);
			return;
		}

		const ratio = Math.min(this.levelDamage / this.levelHealth, 1);
		this.updateStars(ratio);
		this.isPlay = false;
		this.showResult(this.pigsCleared);
	}

	/*-- Loop --*/

	loop(time = 0) {
		requestAnimationFrame(this.boundLoop);

		const t = time / 1000;
		const delta = Math.min(t - this.prevTime, 0.05);
		this.prevTime = t;

		this.snow.material.uniforms.uTime.value = t;

		if (this.isCamMove) this.updateCamera(delta);
		if (this.isPlay) this.updatePhysics(delta);

		this.renderer.shadowMap.needsUpdate = this.isPlay;
		this.renderer.render(this.scene, this.camera);
	}

	updateCamera(delta) {
		const lerpSpeed = 5 * delta;
		const normalized = (this.camera.zoom - 1) / 3;

		const targetZoom =
			this.camera.zoom + (this.zoomTarget - this.camera.zoom) * lerpSpeed;
		if (Math.abs(targetZoom - this.camera.zoom) > 0.0001) {
			this.camera.zoom = targetZoom;
			this.camera.updateProjectionMatrix();
		}

		const factor = 1 + normalized * 3;
		const targetZ = this.camTargetBase.z - this.cursor.x * factor * 10;
		const targetY = this.camTargetBase.y - this.cursor.y * factor * 5;
		this.camTarget.z += (targetZ - this.camTarget.z) * lerpSpeed;
		this.camTarget.y += (targetY - this.camTarget.y) * lerpSpeed;
		this.camera.lookAt(this.camTarget);

		const active = Math.round(normalized * 10);
		if (active !== this.lastZoomSpan) {
			this.elements.zoomSpans.forEach((z, i) =>
				z.classList.toggle("active", i < active),
			);
			this.lastZoomSpan = active;
		}
	}

	updatePhysics(delta) {
		this.world.step(1 / 60, delta, 3);

		if (this.bodiesToRemove.length) {
			this.bodiesToRemove.forEach((b) => this.world.removeBody(b));
			this.bodiesToRemove = [];
		}
		if (this.objectsToDestroy.length) {
			this.objectsToDestroy.forEach((obj) => this.destroy(obj));
			this.objectsToDestroy = [];
		}

		for (const obj of this.physicsObjects) {
			const body = obj.userData.body;
			if (!body || body.sleepState === CANNON.Body.SLEEPING) continue;
			obj.position.copy(body.position);
			obj.quaternion.copy(body.quaternion);
		}

		this.updateDraggedBird();
	}

	updateDraggedBird() {
		if (!this.activeBird?.userData.body || !this.isDrag || !this.pullVector)
			return;

		const radius = this.pullVector.y * MAX_PULL;
		const angle = this.pullVector.x * Math.PI * 0.25;
		const x = SLINGSHOT_POS.x + radius;
		const y = SLINGSHOT_POS.y - radius * 0.5;
		const z = SLINGSHOT_POS.z - Math.sin(angle) * radius;

		this.activeBird.position.set(x, y, z);
		this.syncBodyToMesh(this.activeBird.userData.body, this.activeBird);
		this.updateSlingshot();
	}
}

const game = new Game();
game.init();
