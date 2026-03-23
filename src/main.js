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
			nav: $("nav"),
			levelBtns: $$(".btn-level"),
			soundBtn: $("btn-sound"),
			fullscreenBtn: $("btn-fullscreen"),
			fsIcons: $$(".icon-fs"),
			zoomSpans: $$("#zoom span"),
			powerSpans: $$("#power span"),
			closeBtn: $("btn-close"),
			homes: $$(".home"),
			levels: $$(".level"),
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
		const audio = (src, volume = 1, loop = false) => {
			const a = new Audio(src);
			a.volume = volume;
			a.loop = loop;
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
			end: {
				win: audio("/sounds/end/win.wav"),
				lose: audio("/sounds/end/lose.wav"),
			},
			ice: {
				collide: audio("/sounds/ice/collide.wav"),
				destroy: audio("/sounds/ice/destroy.wav"),
			},
			pig: {
				add: audio("/sounds/pig/add.wav"),
				collide: audio("/sounds/pig/collide.wav"),
				destroy: audio("/sounds/pig/destroy.wav"),
			},
			slingshot: {
				shoot: audio("/sounds/slingshot/shoot.wav"),
				stretch: audio("/sounds/slingshot/stretch.wav"),
			},
			stone: {
				collide: audio("/sounds/stone/collide.wav"),
				destroy: audio("/sounds/stone/destroy.wav"),
			},
			ui: {
				click: audio("/sounds/ui/click.wav"),
				disabled: audio("/sounds/ui/disabled.wav"),
				hover: audio("/sounds/ui/hover.wav"),
			},
			wood: {
				collide: audio("/sounds/wood/collide.wav"),
				destroy: audio("/sounds/wood/destroy.wav"),
			},
		};
	}

	initData() {
		this.health = {
			pig: 25,
			wood: 50,
			stone: 75,
			ice: 25,
			bird: 100,
		};
		this.mass = { pig: 1, wood: 2, stone: 3, ice: 1, bird: 1 };
		this.shootForce = 40;
		this.minImpact = 2;
		this.maxPull = 4;
		this.starThresholds = [0.175, 0.5, 0.825];
		this.slingshotPos = new THREE.Vector3(27.5, 6.75, 0);

		this.snowCount = 3000;
		this.snowArea = 300;
		this.snowHeight = 120;

		this.skyColor = new THREE.Color(0x5aaee8);
		this.sizes = { width: window.innerWidth, height: window.innerHeight };
		this.prevTime = 0;

		this.vec3 = new THREE.Vector3();

		this.isSound = false;
		this.isCamMove = false;
		this.isLoaded = false;
		this.isPlay = false;
		this.isDrag = false;

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

		this.levels = { 1: [], 2: [], 3: [] };
		this.stars = { 1: 0, 2: 0, 3: 0 };
		this.currentLevel = null;
		this.levelHealth = 0;
		this.levelDamage = 0;
		this.birds = [];
		this.pigs = [];
		this.boxes = [];
		this.physicsObjects = [];
		this.activeBird = null;
		this.activeBirdIndex = 0;
		this.bodiesToRemove = [];
		this.objectsToDestroy = [];
	}

	initScene() {
		this.scene = new THREE.Scene();
		this.scene.fog = new THREE.Fog(this.skyColor, 1, 400);

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
		this.renderer.setClearColor(this.skyColor);
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
		const positions = new Float32Array(this.snowCount * 3);
		const speeds = new Float32Array(this.snowCount);
		const winds = new Float32Array(this.snowCount);
		const sizes = new Float32Array(this.snowCount);

		for (let i = 0; i < this.snowCount; i++) {
			positions[i * 3] = (Math.random() - 0.5) * this.snowArea - 100;
			positions[i * 3 + 1] = Math.random() * this.snowHeight;
			positions[i * 3 + 2] = (Math.random() - 0.5) * this.snowArea;
			speeds[i] = 1 + Math.random() * 2;
			winds[i] = Math.random() * Math.PI * 2;
			sizes[i] = 1 + Math.random();
		}

		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
		geometry.setAttribute("aSpeed", new THREE.BufferAttribute(speeds, 1));
		geometry.setAttribute("aWind", new THREE.BufferAttribute(winds, 1));
		geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));

		this.snow = new THREE.Points(
			geometry,
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
			new THREE.MeshBasicMaterial({ color: this.skyColor, fog: false }),
		);
		this.subtitle.position.set(-115, 45, 0);
		group.add(this.subtitle);

		const geometry = new TextGeometry("Angry Birds", {
			font,
			size: 43,
			depth: 0,
			curveSegments: 1,
		});
		geometry.computeBoundingBox();
		geometry.translate(
			-(geometry.boundingBox.max.x - geometry.boundingBox.min.x) * 0.5,
			0,
			0,
		);

		this.title = new THREE.Mesh(
			geometry,
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
		const left = new THREE.Vector3(27.5, 6.75, 1.5);
		const right = new THREE.Vector3(27.5, 6.75, -1.5);

		const leftGeo = new LineGeometry();
		leftGeo.setPositions([
			left.x,
			left.y,
			left.z,
			this.slingshotPos.x,
			this.slingshotPos.y,
			this.slingshotPos.z,
		]);

		const rightGeo = new LineGeometry();
		rightGeo.setPositions([
			right.x,
			right.y,
			right.z,
			this.slingshotPos.x,
			this.slingshotPos.y,
			this.slingshotPos.z,
		]);

		this.slingMat = new LineMaterial({
			color: 0x000000,
			linewidth: 0.25,
			worldUnits: true,
		});

		this.slingMat.resolution.set(
			this.sizes.width * Math.min(window.devicePixelRatio, 2),
			this.sizes.height * Math.min(window.devicePixelRatio, 2),
		);

		this.slingLeft = new Line2(leftGeo, this.slingMat);
		this.slingRight = new Line2(rightGeo, this.slingMat);

		this.scene.add(this.slingLeft, this.slingRight);
	}

	updateSlingshot() {
		const pos = this.activeBird.position;

		this.slingLeft.geometry.setPositions([
			27.5,
			6.75,
			1.5,
			pos.x + 0.5,
			pos.y,
			pos.z,
		]);

		this.slingRight.geometry.setPositions([
			27.5,
			6.75,
			-1.5,
			pos.x + 0.5,
			pos.y,
			pos.z,
		]);
	}

	animateSlingsToSlingshot() {
		const leftGeo = this.slingLeft.geometry;
		const rightGeo = this.slingRight.geometry;
		const startLeft = new THREE.Vector3();
		const startRight = new THREE.Vector3();

		// získat aktuální koncový bod (index 1) ze setPositions
		const leftPositions = leftGeo.attributes.position.array;
		startLeft.set(leftPositions[3], leftPositions[4], leftPositions[5]);

		const rightPositions = rightGeo.attributes.position.array;
		startRight.set(rightPositions[3], rightPositions[4], rightPositions[5]);

		const target = this.slingshotPos;

		// Levý sling
		gsap.to(startLeft, {
			x: target.x,
			y: target.y,
			z: target.z,
			duration: 0.5,
			ease: "elastic.out(1,0.5)",
			onUpdate: () => {
				leftGeo.setPositions([
					27.5,
					6.75,
					1.5, // start point pevný
					startLeft.x,
					startLeft.y,
					startLeft.z, // animovaný konec
				]);
			},
		});

		// Pravý sling
		gsap.to(startRight, {
			x: target.x,
			y: target.y,
			z: target.z,
			duration: 0.5,
			ease: "elastic.out(1,0.5)",
			onUpdate: () => {
				rightGeo.setPositions([
					27.5,
					6.75,
					-1.5, // start point pevný
					startRight.x,
					startRight.y,
					startRight.z, // animovaný konec
				]);
			},
		});
	}

	initEvents() {
		window.addEventListener("resize", () => {
			this.sizes.width = window.innerWidth;
			this.sizes.height = window.innerHeight;
			this.camera.aspect = this.sizes.width / this.sizes.height;
			this.slingMat.resolution.set(
				this.sizes.width * Math.min(window.devicePixelRatio, 2),
				this.sizes.height * Math.min(window.devicePixelRatio, 2),
			);
			this.camera.updateProjectionMatrix();
			this.updateRenderer();
		});

		document.addEventListener("mousemove", (e) => {
			if (this.isCamMove) {
				this.cursor.x = e.clientX / this.sizes.width - 0.5;
				this.cursor.y = e.clientY / this.sizes.height - 0.5;
			}
			if (this.isDrag && this.activeBird) {
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
		});

		window.addEventListener("mousedown", (e) => {
			if (!this.isPlay || !this.activeBird) return;
			document.body.classList.add("dragging");
			this.playSound(this.sounds.slingshot.stretch);
			this.isDrag = true;
			this.dragStart = { x: e.clientX, y: e.clientY };
			this.pullVector = null;
		});

		window.addEventListener("mouseup", () => {
			if (!this.isDrag) return;
			document.body.classList.remove("dragging");
			this.isDrag = false;

			if (this.pullVector && this.pullVector.y > 0.2) {
				this.shootBird(this.pullVector);
				this.playSound(this.sounds.slingshot.shoot);
			} else if (this.activeBird) {
				gsap.to(this.activeBird.position, {
					x: this.slingshotPos.x,
					y: this.slingshotPos.y,
					z: this.slingshotPos.z,
					duration: 0.25,
					ease: "back.out(1.7)",
					onUpdate: () => {
						if (this.activeBird?.userData.body) {
							this.activeBird.userData.body.position.set(
								this.activeBird.position.x,
								this.activeBird.position.y,
								this.activeBird.position.z,
							);
						}
					},
				});
			}

			this.pullVector = null;
			this.elements.powerSpans.forEach((s) => s.classList.remove("active"));
			this.lastPowerSpan = -1;
		});

		window.addEventListener(
			"wheel",
			(e) => {
				if (!this.isCamMove) return;
				this.zoomTarget += e.deltaY * -0.001;
				this.zoomTarget = this.clamp(this.zoomTarget, 1, 4);
			},
			{
				passive: true,
			},
		);

		document.addEventListener("visibilitychange", () => {
			if (document.hidden) this.soundOff();
			else if (this.isSound) this.soundOn();
		});

		this.elements.fullscreenBtn.addEventListener("click", () => {
			if (document.fullscreenElement) document.exitFullscreen();
			else document.documentElement.requestFullscreen();
			this.elements.fsIcons.forEach((el) => el.classList.toggle("active"));
			this.playSound(this.sounds.ui.click);
		});

		this.elements.soundBtn.addEventListener("click", () => {
			this.toggleSound();
			this.playSound(this.sounds.ui.click);
		});

		this.elements.levelBtns.forEach((btn) => {
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

		this.elements.closeBtn.addEventListener("mouseenter", () => {
			this.playSound(this.sounds.ui.hover);
		});

		this.elements.closeBtn.addEventListener("click", () => {
			this.playSound(this.sounds.ui.click);
			this.changeToHome();
		});
	}

	clamp(value, min, max) {
		return Math.min(Math.max(value, min), max);
	}

	playSound(sound) {
		if (!this.isSound || document.hidden) return;
		sound.currentTime = 0;
		sound.play();
	}

	toggleSound() {
		this.isSound = !this.isSound;
		this.isSound ? this.soundOn() : this.soundOff();
		this.elements.soundBtn.classList.toggle("active", this.isSound);
	}

	soundOn() {
		this.sounds.music.play();
	}

	soundOff() {
		this.sounds.music.pause();
		this.sounds.random.forEach((s) => s.pause());
	}

	initRandomSounds() {
		this.sounds.random.forEach((s) => {
			const play = () =>
				setTimeout(
					() => {
						if (this.isSound && !document.hidden) s.play();
						play();
					},
					20000 + Math.random() * 30000,
				);
			play();
		});
	}

	initModel() {
		this.gltfLoader.load("/models/angrybirds.glb", (gltf) => {
			const root = gltf.scene.children[0];

			root.traverse((obj) => {
				if (!obj.isMesh) return;

				const materials = Array.isArray(obj.material)
					? obj.material
					: [obj.material];
				materials.forEach((m) => {
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

	async boot() {
		await this.wait(1000);
		this.setProgress(0.24);
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
		this.loadProgress();

		await this.showTitle();
		this.enableCamMove();
		this.stagger(this.elements.homes, true);
	}

	async stagger(elements, show) {
		const n = elements.length;
		for (let i = 0; i < n; i++) {
			elements[show ? i : n - 1 - i].classList.toggle("show", show);
			await this.wait(100);
		}
	}

	wait(ms) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	setProgress(value) {
		const from =
			(parseFloat(this.elements.loaderProgress.style.getPropertyValue("--s")) ||
				0) * 100;
		const to = value * 100;

		this.elements.loaderProgress.style.setProperty("--s", value);

		const start = performance.now();
		const tick = (time) => {
			const t = Math.min((time - start) / 500, 1);
			this.elements.loaderPercent.textContent =
				Math.round(from + (to - from) * t) + "%";
			if (t < 1) requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	}

	loadProgress() {
		const saved = localStorage.getItem("stars");
		if (!saved) return;

		this.stars = JSON.parse(saved);

		Object.entries(this.stars).forEach(([level, earned]) => {
			const btn = this.elements.levelBtns[level - 1];
			if (!btn) return;

			btn.querySelectorAll(".btn-level-star").forEach((star, i) => {
				star.classList.toggle("active", i < earned);
			});

			if (earned >= 1) {
				const nextBtn = this.elements.levelBtns[level];
				if (nextBtn) nextBtn.classList.remove("locked");
			}
		});

		const total = Object.values(this.stars).reduce((a, b) => a + b, 0);
		this.elements.totalStars.textContent = total;
	}

	resetProgress() {
		localStorage.removeItem("stars");
		this.stars = { 1: 0, 2: 0, 3: 0 };

		this.elements.levelBtns.forEach((btn) => {
			btn.querySelectorAll(".btn-level-star").forEach((star) => {
				star.classList.remove("active");
			});
			if (parseInt(btn.dataset.level) > 1) {
				btn.classList.add("locked");
			}
		});

		this.elements.totalStars.textContent = 0;
	}

	saveProgress() {
		localStorage.setItem("stars", JSON.stringify(this.stars));
	}

	waitForClick() {
		return new Promise((resolve) => {
			document.addEventListener(
				"click",
				() => {
					this.toggleSound();
					this.initRandomSounds();
					this.playSound(this.sounds.ui.click);
					resolve();
				},
				{ once: true },
			);
		});
	}

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
					r: show ? 1 : this.skyColor.r,
					g: show ? 1 : this.skyColor.g,
					b: show ? 1 : this.skyColor.b,
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

	enableCamMove(enable = true) {
		this.isCamMove = enable;
		if (enable) this.camTargetBase = this.camTarget.clone();
	}

	async changeToLevel(id) {
		gsap.to(this.sounds.music, { volume: 0.1, duration: 1 });
		this.showTitle(false);
		this.elements.nav.classList.remove("show");
		this.setupLevel(id);
		this.enableCamMove(false);
		await this.animateCamera(50, 13, 0, 0, 6, 0);
		this.enableCamMove(true);
		this.stagger(this.elements.levels, true);
	}

	async changeToHome() {
		gsap.to(this.sounds.music, { volume: 0.35, duration: 1 });
		this.showTitle();
		this.stagger(this.elements.levels, false);
		this.removeLevel();
		this.enableCamMove(false);
		await this.animateCamera(60, 4, 0, 0, 11, 0);
		this.enableCamMove(true);
		this.elements.nav.classList.add("show");
	}

	async setupLevel(id) {
		this.currentLevel = id;
		this.activeBirdIndex = 0;
		this.activeBird = null;
		this.pigs = [];
		this.boxes = [];
		this.physicsObjects = [];
		this.levelDamage = 0;

		this.levelHealth = this.levels[id].reduce((total, obj) => {
			const type = this.getType(obj.name);
			return type ? total + this.health[type] : total;
		}, 0);

		await this.wait(500);

		await Promise.all(
			this.birds.map(
				(bird, i) =>
					new Promise((resolve) => {
						this.spawnObj(bird, "bird", i, resolve);
					}),
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

		this.elements.destructionProgress.style.setProperty("--d", ratio);

		this.elements.destructionStars.forEach((star, i) => {
			star.classList.toggle("active", ratio >= this.starThresholds[i]);
		});
	}

	spawnObj(obj, type, i, done = null) {
		obj.userData.dead = false;
		obj.userData.health = this.health[type];
		obj.position.copy(obj.userData.origin.position);
		obj.quaternion.copy(obj.userData.origin.quaternion);
		obj.scale.set(0, 0, 0);
		this.scene.add(obj);
		this.animateObj(obj, true, i, () => {
			if (type !== "bird") this.createBody(obj, type);
			done?.();
		});
		this.playSound(this.sounds[type]?.add ?? this.sounds.add);
	}

	getType(name) {
		if (name.startsWith("Pig")) return "pig";
		if (name.startsWith("Box_Stone")) return "stone";
		if (name.startsWith("Box_Wood")) return "wood";
		if (name.startsWith("Box_Ice")) return "ice";
		if (name.startsWith("Bird")) return "bird";
		return null;
	}

	async removeLevel() {
		this.isPlay = false;

		const all = [...this.physicsObjects, ...this.birds];

		await Promise.all(
			all.map(
				(obj, i) =>
					new Promise((resolve) => {
						if (obj.userData.body) {
							this.bodiesToRemove.push(obj.userData.body);
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

		this.pigs = [];
		this.boxes = [];
		this.physicsObjects = [];
		this.activeBird = null;
		this.activeBirdIndex = 0;
		this.currentLevel = null;
		this.levelHealth = 0;
		this.levelDamage = 0;
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
		body.sleepSpeedLimit = 0.5;
		body.sleepTimeLimit = 1.0;

		obj.userData.body = body;
		obj.userData.type = type;
		body.userData = { obj };

		body.addEventListener("collide", (e) => {
			const impact = e.contact.getImpactVelocityAlongNormal();
			if (Math.abs(impact) < this.minImpact) return;
			const dmg = Math.abs(impact) * 4;
			this.damage(obj, dmg);
			if (e.body.userData?.obj) this.damage(e.body.userData.obj, dmg * 0.5);
			this.playSound(this.sounds[type].collide);
		});

		this.world.addBody(body);

		setTimeout(() => {
			if (!obj.userData.body) return;
			body.type = CANNON.Body.DYNAMIC;
			body.mass = this.mass[type];
			body.updateMassProperties();
			body.wakeUp();
		}, 500);
	}

	damage(obj, amount) {
		if (!obj.userData.health || obj.userData.dead) return;
		obj.userData.health -= amount;

		if (obj.userData.type !== "bird") {
			this.levelDamage += amount;
			this.updateDestruction();
		}

		if (obj.userData.health <= 0) {
			if (obj.userData.type === "bird" && !obj.userData.isShot) {
				obj.userData.health = this.health.bird;
				return;
			}
			obj.userData.dead = true;
			this.objectsToDestroy.push(obj);
		}
	}

	destroy(obj) {
		const body = obj.userData.body;
		if (body) {
			const px = body.position.x;
			const py = body.position.y;
			const pz = body.position.z;
			const radiusSq = 10 * 10;

			this.world.bodies.forEach((b) => {
				if (b === body) return;

				const dx = b.position.x - px;
				const dy = b.position.y - py;
				const dz = b.position.z - pz;
				const distSq = dx * dx + dy * dy + dz * dz;

				if (distSq < radiusSq) b.wakeUp();
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

	checkEnd() {
		// Výhra: všechna prasata pryč
		if (this.pigs.length === 0) {
			const ratio = Math.min(this.levelDamage / this.levelHealth, 1);
			this.updateStars(ratio); // teprve tady do level btn a total stars
			this.isPlay = false;
			setTimeout(() => this.showResult(true), 1000);
			return;
		}

		// Prohra: žádní zbývající ptáci, prasata stále na místě
		if (this.activeBirdIndex >= this.birds.length && !this.activeBird) {
			const wait = () => {
				const anyAwake = this.physicsObjects.some(
					(obj) => obj.userData.body?.sleepState !== CANNON.Body.SLEEPING,
				);
				if (anyAwake) {
					setTimeout(wait, 50);
				} else {
					// Nevoláme updateStars, protože není výhra
					this.isPlay = false;
					setTimeout(() => this.showResult(false), 1000);
				}
			};
			wait();
		}
	}

	updateStars(destruction) {
		const earned = this.starThresholds.filter((t) => destruction >= t).length;

		if (earned > this.stars[this.currentLevel]) {
			this.stars[this.currentLevel] = earned;
		}

		const total = Object.values(this.stars).reduce((a, b) => a + b, 0);
		this.elements.totalStars.textContent = total;

		const nextLevel = this.currentLevel + 1;
		if (this.stars[this.currentLevel] >= 1 && this.levels[nextLevel]) {
			const nextBtn = this.elements.levelBtns[nextLevel - 1];
			if (nextBtn) nextBtn.classList.remove("locked");
		}

		const btn = this.elements.levelBtns[this.currentLevel - 1];
		if (btn) {
			btn.querySelectorAll(".btn-level-star").forEach((star, i) => {
				star.classList.toggle("active", i < this.stars[this.currentLevel]);
			});
		}

		this.saveProgress();
	}

	showResult(win) {
		const key = win ? "win" : "lose";
		this.playSound(this.sounds.end[key]);

		const el = this.elements[key];
		el.classList.add("show");
		setTimeout(() => el.classList.remove("show"), 4000);
	}

	prepareBird() {
		if (this.activeBirdIndex >= this.birds.length) return;

		const bird = this.birds[this.activeBirdIndex];
		bird.userData.isShot = false;
		this.activeBird = bird;

		gsap.to(bird.position, {
			x: this.slingshotPos.x - 0.5,
			y: this.slingshotPos.y,
			z: this.slingshotPos.z,
			duration: 0.5,
			ease: "back.out(1.7)",
			onComplete: () => this.createBody(bird, "bird"),
		});
	}

	shootBird(vector) {
		if (!this.activeBird) return;

		this.activeBird.userData.isShot = true;

		const body = this.activeBird.userData.body;
		body.mass = this.mass.bird;
		body.updateMassProperties();
		body.wakeUp();

		const dir = new THREE.Vector3()
			.subVectors(this.slingshotPos, this.activeBird.position)
			.normalize();
		const force = vector.y * this.shootForce;

		body.applyLocalImpulse(
			new CANNON.Vec3(
				dir.x * force,
				dir.y * force + force * 0.3,
				dir.z * force,
			),
			new CANNON.Vec3(0, 0, 0),
		);

		this.animateSlingsToSlingshot();

		this.physicsObjects.push(this.activeBird);
		this.activeBird = null;
		this.activeBirdIndex++;
		this.updateStats();

		setTimeout(() => {
			if (this.activeBirdIndex < this.birds.length) this.prepareBird();
			else this.checkEnd();
		}, 2000);
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

		const zoom =
			this.camera.zoom + (this.zoomTarget - this.camera.zoom) * lerpSpeed;
		if (Math.abs(zoom - this.camera.zoom) > 0.0001) {
			this.camera.zoom = zoom;
			this.camera.updateProjectionMatrix();
		}

		const normalized = (this.camera.zoom - 1) / 3;
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

		if (!this.activeBird || !this.activeBird.userData.body) return;

		if (this.isDrag && this.pullVector) {
			const radius = this.pullVector.y * this.maxPull;
			const angle = this.pullVector.x * Math.PI * 0.2;
			const x = this.slingshotPos.x + radius;
			const y = this.slingshotPos.y - radius * 0.5;
			const z = this.slingshotPos.z - Math.sin(angle) * radius;
			this.activeBird.position.set(x, y, z);
			this.activeBird.userData.body.position.set(x, y, z);
		}

		this.updateSlingshot();
	}
}

const game = new Game();
game.init();
window.game = game;
