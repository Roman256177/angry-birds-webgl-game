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
			music: audio("/sounds/music.mp3", 0.3, true),
			random: [
				{ audio: audio("/sounds/random/crow.mp3") },
				{ audio: audio("/sounds/random/ice.mp3", 0.1) },
				{ audio: audio("/sounds/random/owl.mp3") },
				{ audio: audio("/sounds/random/birds.mp3") },
			],
			bird: { add: audio("/sounds/bird/add.wav") },
			box: { add: audio("/sounds/box/add.wav") },
			pig: { add: audio("/sounds/pig/add.wav") },
			ui: {
				click: audio("/sounds/ui/click.wav"),
				disabled: audio("/sounds/ui/disabled.wav"),
				hover: audio("/sounds/ui/hover.wav"),
			},
		};
	}

	initData() {
		this.isSound = false;
		this.isCamMove = false;
		this.isLoaded = false;
		this.isPlay = false;

		this.cursor = { x: 0, y: 0 };
		this.isDragging = false;
		this.dragStart = { x: 0, y: 0 };
		this.pullVector = null;

		this.zoomTarget = 1;
		this.lastActiveZoom = -1;
		this.camTarget = new THREE.Vector3(2, 4, -6);
		this.camTargetBase = null;

		this.snow = null;
		this.title = null;
		this.subtitle = null;

		this.levels = { 1: [], 2: [], 3: [] };
		this.currentLevel = null;
		this.birds = [];
		this.pigs = [];
		this.boxes = [];
		this.physicsObjects = [];
		this.activeBird = null;
		this.activeBirdIndex = 0;

		this.skyColor = new THREE.Color(0x72b4ec);
		this.sizes = { width: window.innerWidth, height: window.innerHeight };
		this.prevTime = 0;
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
		this.initConfetti();
		this.initEvents();
		this.initModel();
		this.loop();
		this.boot();
	}

	initLights() {
		this.scene.add(new THREE.AmbientLight(0xc8dff0, 0.45));

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
		const count = 3000;
		const area = 300;
		const height = 120;
		const positions = new Float32Array(count * 3);
		const speeds = new Float32Array(count);
		const winds = new Float32Array(count);
		const sizes = new Float32Array(count);

		for (let i = 0; i < count; i++) {
			positions[i * 3] = (Math.random() - 0.5) * area - 100;
			positions[i * 3 + 1] = Math.random() * height;
			positions[i * 3 + 2] = (Math.random() - 0.5) * area;
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
		/*const mat = new THREE.LineBasicMaterial({ color: 0x8b4513, linewidth: 2 });

		const leftGeo = new THREE.BufferGeometry().setFromPoints([
			SLING_LEFT,
			SLINGSHOT_POS,
		]);
		const rightGeo = new THREE.BufferGeometry().setFromPoints([
			SLING_RIGHT,
			SLINGSHOT_POS,
		]);

		this.slingLeft = new THREE.Line(leftGeo, mat);
		this.slingRight = new THREE.Line(rightGeo, mat);

		this.scene.add(this.slingLeft, this.slingRight);*/
	}

	initConfetti() {
		/*this.confettiGeo = new THREE.PlaneGeometry(0.3, 0.3);
		this.confettiMats = CONFETTI_COLORS.map(
			(c) => new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }),
		);*/
	}

	initEvents() {
		window.addEventListener("resize", () => {
			this.sizes.width = window.innerWidth;
			this.sizes.height = window.innerHeight;
			this.camera.aspect = this.sizes.width / this.sizes.height;
			this.camera.updateProjectionMatrix();
			this.updateRenderer();
		});

		document.addEventListener("mousemove", (e) => {
			if (this.isCamMove) {
				this.cursor.x = e.clientX / this.sizes.width - 0.5;
				this.cursor.y = e.clientY / this.sizes.height - 0.5;
			}
			if (this.isDragging && this.activeBird) {
				this.pullVector = {
					x: (e.clientX - this.dragStart.x) / this.sizes.width,
					y: (e.clientY - this.dragStart.y) / this.sizes.height,
				};
			}
		});

		window.addEventListener("mousedown", (e) => {
			if (!this.isPlay || !this.activeBird) return;
			this.isDragging = true;
			this.dragStart = { x: e.clientX, y: e.clientY };
			this.pullVector = null;
		});

		window.addEventListener("mouseup", () => {
			if (!this.isDragging) return;
			this.isDragging = false;
			if (
				this.pullVector &&
				Math.hypot(this.pullVector.x, this.pullVector.y) > 0.02
			) {
				this._shootBird(this.pullVector);
			}
			this.pullVector = null;
		});

		window.addEventListener(
			"wheel",
			(e) => {
				if (!this.isCamMove) return;
				this.zoomTarget += e.deltaY * -0.001;
				this.zoomTarget = Math.min(Math.max(this.zoomTarget, 1), 4);
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

		this.elements.closeBtn.addEventListener("click", () => {
			this.playSound(this.sounds.ui.click);
			this.changeToHome();
		});

		this.elements.closeBtn.addEventListener("mouseenter", () => {
			this.playSound(this.sounds.ui.hover);
		});
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
		this.sounds.random.forEach((s) => s.audio.pause());
	}

	initRandomSounds() {
		this.sounds.random.forEach((s) => {
			const play = () =>
				setTimeout(
					() => {
						if (this.isSound && !document.hidden) s.audio.play();
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

			const take = (name) => {
				const obj = root.getObjectByName(name);
				root.remove(obj);
				return obj;
			};

			this.levels[1] = [...take("Level_1").children];
			this.levels[2] = [...take("Level_2").children];
			this.levels[3] = [...take("Level_3").children];
			this.birds = [...take("Birds").children];

			root.traverse((obj) => {
				if (!obj.isMesh) return;

				[obj.material].flat().forEach((m) => {
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

			this.scene.add(root);
		});
	}

	async boot() {
		await this.wait(1000);
		this.setProgress(0.17);
		await this.wait(1000);
		this.setProgress(0.44);
		await this.wait(1000);
		this.setProgress(0.67);
		await this.wait(1000);

		while (!this.isLoaded) await this.wait(50);

		this.setProgress(1);
		await this.wait(1000);
		this.elements.loaderClick.classList.add("show");
		this.elements.loaderText.classList.add("hide");
		this.elements.loader.classList.add("pointer");

		await this.waitForClick();

		this.elements.loaderInner.classList.add("hide");
		this.elements.loader.classList.remove("pointer");
		await this.wait(500);

		this.elements.loader.classList.add("hide");
		await this.animateCamera(60, 4, 0, 0, 11, 0);
		this.elements.loader.classList.add("remove");

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
			const ease = 1 - Math.pow(1 - t, 3);
			this.elements.loaderPercent.textContent =
				Math.round(from + (to - from) * ease) + "%";
			if (t < 1) requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
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
				{ value: show ? 1 : 0, duration: 1.5, ease: "power1.inOut" },
				0,
			);
			tl.to(
				this.subtitle.material.color,
				{
					r: show ? 1 : this.skyColor.r,
					g: show ? 1 : this.skyColor.g,
					b: show ? 1 : this.skyColor.b,
					duration: 1.5,
					ease: "power1.inOut",
				},
				0,
			);
			tl.to(
				this.subtitle.position,
				{ y: show ? 40 : 45, duration: 1.5, ease: "power1.inOut" },
				0,
			);
		});
	}

	enableCamMove(enable = true) {
		this.isCamMove = enable;
		if (enable) this.camTargetBase = this.camTarget.clone();
	}

	changeToLevel(id) {
		this.showLevelUi();
		this.showTitle(false);
		this.enableCamMove(false);
		this.animateCamera(50, 13, 0, 0, 6, 0);
		this.enableCamMove(true);
	}

	changeToHome() {
		this.showLevelUi(false);
		this.showTitle();
		this.enableCamMove(false);
		this.animateCamera(60, 4, 0, 0, 11, 0);
		this.enableCamMove(true);
	}

	showLevelUi(level = true) {
		this.elements.nav.classList.toggle("show", !level);
		this.stagger(this.elements.levels, level);
	}

	async setupLevel(id) {
		/*
		this._showLevelUi();
		this._enableCameraMove(false);

		this.currentLevel = id;
		this.activeBirdIndex = 0;
		this.activeBird = null;
		this.pigs = [];
		this.boxes = [];

		const spawnObj = (obj, type, i) => {
			obj.userData.dead = false;
			obj.userData.health = HEALTH[type];
			obj.castShadow = true;
			obj.receiveShadow = true;
			obj.scale.set(0, 0, 0);
			this.scene.add(obj);
			//this._createBody(obj, type);
			gsap.to(obj.scale, {
				x: 1,
				y: 1,
				z: 1,
				duration: 0.5,
				delay: i * 0.1,
				ease: "back.out(1.7)",
				onStart: () =>
					this._playSound(
						this.sounds[
							type === "Pig" ? "pig" : type.startsWith("Bird") ? "bird" : "box"
						].add,
					),
			});
		};

		this.levels[id].forEach((obj, i) => {
			const type = this._getType(obj.name);
			if (type === "Pig") this.pigs.push(obj);
			else this.boxes.push(obj);
			spawnObj(obj, type, i);
		});

		this.birds.forEach((bird, i) => {
			spawnObj(bird, "Bird", i);
		});

		this.physicsObjects = [...this.birds, ...this.pigs, ...this.boxes];

		await this._animateCamera(50, 10, 0, 0, 8, 0);
		this._enableCameraMove(true);
		//this._prepareBird();
		this.isPlay = true;*/
	}

	_getType(name) {
		if (name.startsWith("Pig")) return "Pig";
		if (name.startsWith("Box_Stone")) return "Box_Stone";
		if (name.startsWith("Box_Wood")) return "Box_Wood";
		if (name.startsWith("Box_Ice")) return "Box_Ice";
		if (name.startsWith("Bird")) return "Bird";
		return null;
	}

	/*-- Physics --*/

	_createBody(obj, type) {
		if (obj.userData.body) {
			this.world.removeBody(obj.userData.body);
			obj.userData.body = null;
		}

		obj.geometry.computeBoundingBox();
		obj.geometry.boundingBox.getSize(_vec3);

		const isSphere = type === "Pig" || type === "Bird";
		const shape = isSphere
			? new CANNON.Sphere(_vec3.x * 0.5)
			: new CANNON.Box(
					new CANNON.Vec3(_vec3.x * 0.5, _vec3.y * 0.5, _vec3.z * 0.5),
				);

		const body = new CANNON.Body({
			mass: MASS[type],
			shape,
			linearDamping: 0.3,
			angularDamping: 0.3,
		});

		obj.getWorldPosition(_vec3);
		body.position.set(_vec3.x, _vec3.y, _vec3.z);
		body.allowSleep = true;
		body.sleepSpeedLimit = 0.5;
		body.sleepTimeLimit = 1.0;

		obj.userData.body = body;
		obj.userData.health = HEALTH[type];
		obj.userData.type = type;
		obj.userData.dead = false;
		body.userData = { obj };

		body.addEventListener("collide", (e) => {
			const impact = e.contact.getImpactVelocityAlongNormal();
			if (Math.abs(impact) < MIN_IMPACT) return;
			const dmg = Math.abs(impact) * 2;
			this._damage(obj, dmg);
			if (e.body.userData?.obj) this._damage(e.body.userData.obj, dmg * 0.5);
		});

		this.world.addBody(body);
	}

	_damage(obj, amount) {
		if (!obj.userData.health || obj.userData.dead) return;
		obj.userData.health -= amount;

		const ratio = Math.max(0, obj.userData.health / HEALTH[obj.userData.type]);
		[obj.material].flat().forEach((m) => {
			if (m.color) m.color.lerp(DAMAGE_COLOR, 1 - ratio);
		});

		if (obj.userData.health <= 0) this._destroy(obj);
	}

	_destroy(obj) {
		if (obj.userData.dead) return;
		obj.userData.dead = true;

		obj.getWorldPosition(_vec3);
		this._spawnConfetti(_vec3);

		gsap.to(obj.scale, {
			x: 0,
			y: 0,
			z: 0,
			duration: 0.3,
			ease: "back.in(2)",
			onComplete: () => {
				obj.visible = false;
				this.world.removeBody(obj.userData.body);
			},
		});

		this.pigs = this.pigs.filter((o) => o !== obj);
		this.boxes = this.boxes.filter((o) => o !== obj);
		this.physicsObjects = this.physicsObjects.filter((o) => o !== obj);

		this._checkEndCondition();
	}

	_spawnConfetti(position) {
		for (let i = 0; i < 20; i++) {
			const mat =
				this.confettiMats[Math.floor(Math.random() * this.confettiMats.length)];
			const mesh = new THREE.Mesh(this.confettiGeo, mat);
			mesh.position.copy(position);
			mesh.rotation.set(
				Math.random() * Math.PI,
				Math.random() * Math.PI,
				Math.random() * Math.PI,
			);
			this.scene.add(mesh);

			const vx = (Math.random() - 0.5) * 10;
			const vy = 5 + Math.random() * 8;
			const vz = (Math.random() - 0.5) * 10;

			gsap.to(mesh.position, {
				x: mesh.position.x + vx,
				y: mesh.position.y + vy,
				z: mesh.position.z + vz,
				duration: 0.4,
				ease: "power2.out",
				onComplete: () => {
					gsap.to(mesh.position, {
						y: mesh.position.y - 20,
						duration: 1.2,
						ease: "power1.in",
						onComplete: () => this.scene.remove(mesh),
					});
				},
			});

			gsap.to(mesh.rotation, {
				x: mesh.rotation.x + Math.random() * Math.PI * 4,
				y: mesh.rotation.y + Math.random() * Math.PI * 4,
				duration: 1.6,
				ease: "none",
			});
		}
	}

	/*-- Bird --*/

	_prepareBird() {
		if (this.activeBirdIndex >= this.birds.length) return;

		const bird = this.birds[this.activeBirdIndex];
		this.scene.add(bird);
		bird.visible = true;
		bird.scale.set(0, 0, 0);
		bird.position.copy(SLINGSHOT_POS);

		if (!bird.userData.body) this._createBody(bird, "Bird");

		const body = bird.userData.body;
		body.mass = 0;
		body.updateMassProperties();
		body.position.set(SLINGSHOT_POS.x, SLINGSHOT_POS.y, SLINGSHOT_POS.z);
		body.velocity.set(0, 0, 0);
		body.angularVelocity.set(0, 0, 0);

		gsap.to(bird.scale, {
			x: 1,
			y: 1,
			z: 1,
			duration: 0.4,
			ease: "back.out(2)",
		});

		this.activeBird = bird;
		this._playSound(this.sounds.bird.add);
	}

	_shootBird(pull) {
		if (!this.activeBird) return;

		const body = this.activeBird.userData.body;
		body.mass = MASS.Bird;
		body.updateMassProperties();
		body.wakeUp();
		body.applyImpulse(
			new CANNON.Vec3(-pull.x * SHOOT_FORCE, -pull.y * SHOOT_FORCE, 0),
			body.position,
		);

		this.activeBird = null;
		this.activeBirdIndex++;

		setTimeout(() => {
			if (this.activeBirdIndex < this.birds.length) this._prepareBird();
			else this._checkEndCondition();
		}, 2000);
	}

	_checkEndCondition() {
		if (this.pigs.length === 0) {
			const bonus = this.birds.length - this.activeBirdIndex;
			console.log(`Win! Bonus birds: ${bonus}`);
			// TODO: show win UI
		} else if (this.activeBirdIndex >= this.birds.length) {
			console.log("Out of birds.");
			// TODO: show lose UI
		}
	}

	/*-- Loop --*/

	loop(time = 0) {
		requestAnimationFrame(this.boundLoop);

		const delta = Math.min((time - this.prevTime) / 1000, 0.05);
		this.prevTime = time;

		this.snow.material.uniforms.uTime.value = time / 1000;

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
		if (active !== this.lastActiveZoom) {
			this.elements.zoomSpans.forEach((z, i) =>
				z.classList.toggle("active", i < active),
			);
			this.lastActiveZoom = active;
		}
	}

	updatePhysics(delta) {
		this.world.step(1 / 60, delta, 3);

		for (const obj of this.physicsObjects) {
			const body = obj.userData.body;
			if (!body || body.sleepState === CANNON.Body.SLEEPING) continue;
			obj.position.copy(body.position);
			obj.quaternion.copy(body.quaternion);
		}
	}
}

const game = new Game();
game.init();
