/**
 * ============================================================================
 * RoomCraft 3D Studio - Core Application Logic
 * Vanilla JavaScript (ES6+) & Three.js (r128)
 * ============================================================================
 */

(function() {
  'use strict';

  // --------------------------------------------------------------------------
  // Global Application State
  // --------------------------------------------------------------------------
  const state = {
    room: {
      width: 10,       // X axis: -5 to +5
      depth: 8,        // Z axis: -4 to +4
      height: 3.2,     // Y axis: 0 to 3.2
      floorType: 'wood',
      wallColor: '#f4efe6',
      wallPattern: 'clean',
      showSideWalls: true
    },
    lighting: {
      isDay: true,
      shadows: true
    },
    selectedObject: null,
    isDragging: false,
    placedItems: [],
    catalog: []
  };

  // Three.js Core Objects
  let scene, camera, renderer, controls;
  let floorMesh, floorMaterial, wallBack, wallLeft, wallRight, baseboardGroup;
  let ambientLight, hemiLight, dirLight, nightRoomLight;
  let floorGrid, selectionHelper;
  let raycaster, mouse, dragPlane, dragIntersection, dragOffset;
  let canvasContainer;

  // DOM Elements Cache
  const DOM = {};

  // --------------------------------------------------------------------------
  // Procedural Canvas Textures (Standalone, Zero CORS Dependency)
  // --------------------------------------------------------------------------
  const TextureGenerator = {
    /**
     * 내추럴 오크 마루 바닥재 캔버스 텍스처 생성
     */
    createWood() {
      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 1024;
      const ctx = canvas.getContext('2d');

      ctx.fillStyle = '#b08968';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const rows = 8;
      const cols = 4;
      const rh = canvas.height / rows;
      const cw = canvas.width / cols;

      const woodColors = ['#9c6644', '#b08968', '#7f4f24', '#a68a64', '#8d5b4c'];

      for (let r = 0; r < rows; r++) {
        const offset = (r % 2) * (cw / 2);
        for (let c = -1; c <= cols + 1; c++) {
          const x = c * cw + offset;
          const y = r * rh;
          
          ctx.fillStyle = woodColors[(r * 3 + c * 7 + 100) % woodColors.length];
          ctx.fillRect(x, y, cw, rh);

          // Subtle wood grain lines
          ctx.strokeStyle = 'rgba(60, 30, 10, 0.12)';
          ctx.lineWidth = 1;
          for (let i = 4; i < rh; i += 6) {
            ctx.beginPath();
            ctx.moveTo(x, y + i + Math.sin(i) * 2);
            ctx.lineTo(x + cw, y + i + Math.cos(i) * 3);
            ctx.stroke();
          }

          // Plank Bevel Seams
          ctx.strokeStyle = 'rgba(30, 15, 5, 0.5)';
          ctx.lineWidth = 2.5;
          ctx.strokeRect(x, y, cw, rh);
        }
      }

      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(4, 3);
      return texture;
    },

    /**
     * 비앙코 카라라 대리석 캔버스 텍스처 생성
     */
    createMarble() {
      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 1024;
      const ctx = canvas.getContext('2d');

      // Base off-white marble
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Delicate gray marble veins
      const drawVein = (startX, startY, color, width, branches) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        let cx = startX;
        let cy = startY;
        ctx.moveTo(cx, cy);

        for (let i = 0; i < 40; i++) {
          cx += (Math.random() - 0.45) * 45;
          cy += Math.random() * 35;
          ctx.lineTo(cx, cy);

          if (branches && Math.random() > 0.75) {
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            let bx = cx;
            let by = cy;
            for (let j = 0; j < 10; j++) {
              bx += (Math.random() - 0.5) * 30;
              by += Math.random() * 20;
              ctx.lineTo(bx, by);
            }
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(cx, cy);
          }
        }
        ctx.stroke();
      };

      for (let v = 0; v < 6; v++) {
        drawVein(Math.random() * canvas.width, 0, 'rgba(148, 163, 184, 0.28)', 3, true);
        drawVein(Math.random() * canvas.width, 0, 'rgba(100, 116, 139, 0.15)', 1.5, false);
      }

      // Large tile seams
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
      ctx.lineWidth = 3;
      ctx.strokeRect(0, 0, canvas.width, canvas.height);
      ctx.strokeRect(canvas.width / 2, 0, canvas.width / 2, canvas.height / 2);
      ctx.strokeRect(0, canvas.height / 2, canvas.width / 2, canvas.height / 2);

      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(3, 2);
      return texture;
    },

    /**
     * 모던 세라믹 타일 캔버스 텍스처 생성
     */
    createTile() {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');

      ctx.fillStyle = '#64748b';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const size = 128;
      for (let x = 0; x < canvas.width; x += size) {
        for (let y = 0; y < canvas.height; y += size) {
          // Inner tile body
          ctx.fillStyle = '#94a3b8';
          ctx.fillRect(x + 3, y + 3, size - 6, size - 6);

          // Subtle gradient chamfer
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 4, y + 4, size - 8, size - 8);
        }
      }

      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(5, 4);
      return texture;
    },

    /**
     * 노출 에폭시 콘크리트 캔버스 텍스처 생성
     */
    createConcrete() {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');

      ctx.fillStyle = '#475569';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Noise speckles
      for (let i = 0; i < 40000; i++) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const alpha = Math.random() * 0.08;
        ctx.fillStyle = Math.random() > 0.5 ? `rgba(255, 255, 255, ${alpha})` : `rgba(0, 0, 0, ${alpha})`;
        ctx.fillRect(x, y, 2, 2);
      }

      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(4, 3);
      return texture;
    },

    /**
     * 벽지 패턴 텍스처 (린넨 / 스트라이프)
     */
    createWallPattern(type, baseHex) {
      if (type === 'clean') return null;

      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');

      ctx.fillStyle = baseHex;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (type === 'stripe') {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
        for (let x = 0; x < canvas.width; x += 16) {
          ctx.fillRect(x, 0, 8, canvas.height);
        }
      } else if (type === 'linen') {
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.04)';
        ctx.lineWidth = 1;
        for (let y = 0; y < canvas.height; y += 4) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(canvas.width, y);
          ctx.stroke();
        }
        for (let x = 0; x < canvas.width; x += 4) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, canvas.height);
          ctx.stroke();
        }
      }

      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(8, 4);
      return texture;
    },

    /**
     * 스마트 TV 스크린 UI 캔버스 텍스처
     */
    createTVScreen() {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 288;
      const ctx = canvas.getContext('2d');

      // Cinematic ambient gradient
      const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      grad.addColorStop(0, '#0f172a');
      grad.addColorStop(0.5, '#1e1b4b');
      grad.addColorStop(1, '#311042');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Abstract glowing shapes
      ctx.fillStyle = 'rgba(99, 102, 241, 0.3)';
      ctx.beginPath();
      ctx.arc(360, 140, 100, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(236, 72, 153, 0.25)';
      ctx.beginPath();
      ctx.arc(200, 190, 80, 0, Math.PI * 2);
      ctx.fill();

      // TV UI Top Bar
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText('CINEMA 4K HDR', 24, 36);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.font = '12px sans-serif';
      ctx.fillText('10:42 PM', canvas.width - 80, 36);

      // Hero Content text
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 24px sans-serif';
      ctx.fillText('Cosmic Odyssey', 24, 210);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
      ctx.font = '12px sans-serif';
      ctx.fillText('▶ 지금 재생하기  •  Ultra High Definition', 24, 235);

      const texture = new THREE.CanvasTexture(canvas);
      return texture;
    }
  };

  // --------------------------------------------------------------------------
  // Furniture Procedural Model Factory (Rich Composite Geometries)
  // --------------------------------------------------------------------------
  const FurnitureFactory = {
    /**
     * 공통 헬퍼: 메시에 그림자 설정 적용
     */
    applyShadows(mesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    },

    /**
     * 1. 모던 3인용 소파 (Sofa)
     */
    createSofa(primaryColor = '#475569') {
      const group = new THREE.Group();
      const colorables = [];

      // Primary fabric material
      const fabricMat = new THREE.MeshStandardMaterial({
        color: primaryColor,
        roughness: 0.85,
        metalness: 0.05
      });
      colorables.push(fabricMat);

      // Wood legs material
      const woodMat = new THREE.MeshStandardMaterial({
        color: '#3d2817',
        roughness: 0.6
      });

      // Cushion accent material
      const pillowMat = new THREE.MeshStandardMaterial({
        color: '#e2e8f0',
        roughness: 0.9
      });

      // Main seat base
      const base = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.25, 0.95), fabricMat);
      base.position.y = 0.25;
      group.add(this.applyShadows(base));

      // 3 Seat Cushions
      for (let i = -1; i <= 1; i++) {
        const cushion = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.18, 0.85), fabricMat);
        cushion.position.set(i * 0.74, 0.44, 0.02);
        group.add(this.applyShadows(cushion));
      }

      // Backrest
      const backrest = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.65, 0.22), fabricMat);
      backrest.position.set(0, 0.7, -0.38);
      group.add(this.applyShadows(backrest));

      // Backrest Pillows
      for (let i = -1; i <= 1; i++) {
        const backPillow = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.45, 0.14), fabricMat);
        backPillow.position.set(i * 0.74, 0.72, -0.25);
        backPillow.rotation.x = 0.08;
        group.add(this.applyShadows(backPillow));
      }

      // Left & Right Armrests
      const armL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.45, 0.95), fabricMat);
      armL.position.set(-1.18, 0.55, 0);
      const armR = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.45, 0.95), fabricMat);
      armR.position.set(1.18, 0.55, 0);
      group.add(this.applyShadows(armL), this.applyShadows(armR));

      // Throw Pillows
      const throwPillow1 = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.12), pillowMat);
      throwPillow1.position.set(-0.95, 0.58, -0.15);
      throwPillow1.rotation.y = 0.3;
      throwPillow1.rotation.z = -0.15;
      const throwPillow2 = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.12), pillowMat);
      throwPillow2.position.set(0.95, 0.58, -0.15);
      throwPillow2.rotation.y = -0.3;
      throwPillow2.rotation.z = 0.15;
      group.add(this.applyShadows(throwPillow1), this.applyShadows(throwPillow2));

      // 4 Wooden Tapered Legs
      const legGeo = new THREE.CylinderGeometry(0.035, 0.02, 0.16, 12);
      const legPositions = [
        [-1.05, 0.08, -0.38],
        [1.05, 0.08, -0.38],
        [-1.05, 0.08, 0.38],
        [1.05, 0.08, 0.38]
      ];
      legPositions.forEach(([x, y, z]) => {
        const leg = new THREE.Mesh(legGeo, woodMat);
        leg.position.set(x, y, z);
        leg.rotation.z = x > 0 ? -0.12 : 0.12;
        group.add(this.applyShadows(leg));
      });

      group.userData = {
        name: '3인용 모던 패브릭 소파',
        category: '거실',
        colorables: colorables,
        type: 'sofa'
      };

      return group;
    },

    /**
     * 2. 킹사이즈 침대 & 사이드 협탁 세트 (Bed)
     */
    createBed(duvetColor = '#3b82f6') {
      const group = new THREE.Group();
      const colorables = [];

      const frameMat = new THREE.MeshStandardMaterial({ color: '#27272a', roughness: 0.7 });
      const mattressMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95 });
      const duvetMat = new THREE.MeshStandardMaterial({ color: duvetColor, roughness: 0.85 });
      colorables.push(duvetMat);

      const pillowMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.9 });
      const woodMat = new THREE.MeshStandardMaterial({ color: '#854d0e', roughness: 0.6 });

      // Bed Frame
      const frame = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.25, 2.2), frameMat);
      frame.position.set(0, 0.15, 0);
      group.add(this.applyShadows(frame));

      // Tall Headboard
      const headboard = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.1, 0.15), frameMat);
      headboard.position.set(0, 0.7, -1.05);
      group.add(this.applyShadows(headboard));

      // Mattress
      const mattress = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.35, 2.05), mattressMat);
      mattress.position.set(0, 0.42, 0.02);
      group.add(this.applyShadows(mattress));

      // Duvet (Cozy blanket folded back)
      const duvet = new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.15, 1.45), duvetMat);
      duvet.position.set(0, 0.54, 0.32);
      group.add(this.applyShadows(duvet));

      // 2 Twin Pillows
      const pillowGeo = new THREE.BoxGeometry(0.65, 0.18, 0.42);
      const pillowL = new THREE.Mesh(pillowGeo, pillowMat);
      pillowL.position.set(-0.52, 0.65, -0.68);
      pillowL.rotation.x = 0.15;
      const pillowR = new THREE.Mesh(pillowGeo, pillowMat);
      pillowR.position.set(0.52, 0.65, -0.68);
      pillowR.rotation.x = 0.15;
      group.add(this.applyShadows(pillowL), this.applyShadows(pillowR));

      // 2 Bedside Tables with mini touch lamps
      const sideTableGeo = new THREE.BoxGeometry(0.5, 0.45, 0.45);
      const lampBaseGeo = new THREE.CylinderGeometry(0.08, 0.1, 0.04, 16);
      const lampShadeGeo = new THREE.CylinderGeometry(0.12, 0.16, 0.22, 16);
      const lampMat = new THREE.MeshStandardMaterial({
        color: '#fef08a',
        emissive: '#eab308',
        emissiveIntensity: 0.35
      });

      [-1.35, 1.35].forEach((sx) => {
        const nightstand = new THREE.Mesh(sideTableGeo, woodMat);
        nightstand.position.set(sx, 0.225, -0.85);
        group.add(this.applyShadows(nightstand));

        const lampBase = new THREE.Mesh(lampBaseGeo, frameMat);
        lampBase.position.set(sx, 0.47, -0.85);
        const lampShade = new THREE.Mesh(lampShadeGeo, lampMat);
        lampShade.position.set(sx, 0.62, -0.85);
        group.add(this.applyShadows(lampBase), this.applyShadows(lampShade));
      });

      group.userData = {
        name: '킹사이즈 침대 & 협탁 세트',
        category: '침실',
        colorables: colorables,
        type: 'bed'
      };

      return group;
    },

    /**
     * 3. 65인치 스마트 TV & 미디어 콘솔 (Smart TV & Media Unit)
     */
    createSmartTV() {
      const group = new THREE.Group();
      const colorables = [];

      const consoleMat = new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.6 });
      colorables.push(consoleMat);

      const tvBezelMat = new THREE.MeshStandardMaterial({ color: '#09090b', roughness: 0.3 });
      const metalLegMat = new THREE.MeshStandardMaterial({ color: '#18181b', metalness: 0.8, roughness: 0.3 });

      // Low TV Console Cabinet
      const cabinet = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.42, 0.45), consoleMat);
      cabinet.position.set(0, 0.35, 0);
      group.add(this.applyShadows(cabinet));

      // Console Legs
      [-1.05, 1.05].forEach((lx) => {
        [-0.16, 0.16].forEach((lz) => {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.14, 8), metalLegMat);
          leg.position.set(lx, 0.07, lz);
          group.add(this.applyShadows(leg));
        });
      });

      // TV Screen Frame (65" scale)
      const screenFrame = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.95, 0.04), tvBezelMat);
      screenFrame.position.set(0, 1.15, 0);
      group.add(this.applyShadows(screenFrame));

      // Display Mesh with Screen Texture
      const screenTexture = TextureGenerator.createTVScreen();
      const screenMat = new THREE.MeshBasicMaterial({ map: screenTexture });
      const screenPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.56, 0.91), screenMat);
      screenPlane.position.set(0, 1.15, 0.025);
      group.add(screenPlane);

      // TV Metal Stand
      const tvStandBase = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.28), metalLegMat);
      tvStandBase.position.set(0, 0.58, 0);
      const tvStandStem = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.15, 0.05), metalLegMat);
      tvStandStem.position.set(0, 0.65, -0.01);
      group.add(this.applyShadows(tvStandBase), this.applyShadows(tvStandStem));

      // Soundbar
      const soundbarMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.8 });
      const soundbar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.07, 0.1), soundbarMat);
      soundbar.position.set(0, 0.595, 0.12);
      group.add(this.applyShadows(soundbar));

      group.userData = {
        name: '65인치 스마트 TV & 미디어장',
        category: '거실',
        colorables: colorables,
        type: 'tv_unit'
      };

      return group;
    },

    /**
     * 4. 프렌치 도어 냉장고 (French Door Refrigerator)
     */
    createRefrigerator() {
      const group = new THREE.Group();
      const colorables = [];

      const stainlessMat = new THREE.MeshStandardMaterial({
        color: '#cbd5e1',
        metalness: 0.85,
        roughness: 0.25
      });
      colorables.push(stainlessMat);

      const blackTrimMat = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.4 });
      const handleMat = new THREE.MeshStandardMaterial({ color: '#94a3b8', metalness: 0.9, roughness: 0.2 });

      // Main Refrigerator Body
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.88, 0.85), stainlessMat);
      body.position.set(0, 0.94, 0);
      group.add(this.applyShadows(body));

      // Split Doors Seam (visual illusion via thin black box)
      const doorSeam = new THREE.Mesh(new THREE.BoxGeometry(0.01, 1.15, 0.02), blackTrimMat);
      doorSeam.position.set(0, 1.25, 0.43);
      group.add(doorSeam);

      // Bottom Freezer Drawer Seam
      const drawerSeam = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.015, 0.02), blackTrimMat);
      drawerSeam.position.set(0, 0.65, 0.43);
      group.add(drawerSeam);

      // 2 Vertical Upper Handles
      [-0.08, 0.08].forEach((hx) => {
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.75, 12), handleMat);
        handle.position.set(hx, 1.25, 0.46);
        group.add(this.applyShadows(handle));
      });

      // Bottom Drawer Horizontal Handle
      const bottomHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.75, 12), handleMat);
      bottomHandle.position.set(0, 0.58, 0.46);
      bottomHandle.rotation.z = Math.PI / 2;
      group.add(this.applyShadows(bottomHandle));

      // Digital Water/Ice Dispenser Panel
      const dispenserPanel = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.38, 0.02), blackTrimMat);
      dispenserPanel.position.set(-0.25, 1.35, 0.43);
      group.add(dispenserPanel);

      // Cyan LED Indicator
      const ledMat = new THREE.MeshBasicMaterial({ color: '#38bdf8' });
      const led = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.01), ledMat);
      led.position.set(-0.25, 1.45, 0.442);
      group.add(led);

      group.userData = {
        name: '프리미엄 4도어 메탈 냉장고',
        category: '주방/가전',
        colorables: colorables,
        type: 'fridge'
      };

      return group;
    },

    /**
     * 5. 모던 4인 식탁 & 의자 세트 (Dining Table & Chairs)
     */
    createDiningTable(woodColor = '#854d0e') {
      const group = new THREE.Group();
      const colorables = [];

      const topMat = new THREE.MeshStandardMaterial({ color: woodColor, roughness: 0.5 });
      colorables.push(topMat);

      const metalMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.4, metalness: 0.7 });
      const seatMat = new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.9 });

      // Tabletop
      const tabletop = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.9), topMat);
      tabletop.position.set(0, 0.75, 0);
      group.add(this.applyShadows(tabletop));

      // Table Angled Metal Legs
      [[-0.68, -0.35], [0.68, -0.35], [-0.68, 0.35], [0.68, 0.35]].forEach(([lx, lz]) => {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.74, 12), metalMat);
        leg.position.set(lx, 0.37, lz);
        leg.rotation.z = lx < 0 ? 0.08 : -0.08;
        leg.rotation.x = lz < 0 ? -0.08 : 0.08;
        group.add(this.applyShadows(leg));
      });

      // 4 Dining Chairs
      const chairPositions = [
        [-0.45, 0.45, Math.PI],
        [0.45, 0.45, Math.PI],
        [-0.45, -0.45, 0],
        [0.45, -0.45, 0]
      ];

      chairPositions.forEach(([cx, cz, crot]) => {
        const chairGroup = new THREE.Group();
        chairGroup.position.set(cx, 0, cz);
        chairGroup.rotation.y = crot;

        // Seat
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 0.4), seatMat);
        seat.position.y = 0.44;
        chairGroup.add(this.applyShadows(seat));

        // Backrest
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.38, 0.04), seatMat);
        back.position.set(0, 0.65, -0.18);
        chairGroup.add(this.applyShadows(back));

        // 4 Legs
        [[-0.18, -0.16], [0.18, -0.16], [-0.18, 0.16], [0.18, 0.16]].forEach(([clx, clz]) => {
          const cleg = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.012, 0.44, 8), metalMat);
          cleg.position.set(clx, 0.22, clz);
          chairGroup.add(this.applyShadows(cleg));
        });

        group.add(chairGroup);
      });

      group.userData = {
        name: '4인용 원목 식탁 & 의자 세트',
        category: '주방/가전',
        colorables: colorables,
        type: 'dining_set'
      };

      return group;
    },

    /**
     * 6. 라운지 체어 & 오토만 (Lounge Chair & Ottoman)
     */
    createLoungeChair(accentColor = '#059669') {
      const group = new THREE.Group();
      const colorables = [];

      const cushionMat = new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.75 });
      colorables.push(cushionMat);

      const shellMat = new THREE.MeshStandardMaterial({ color: '#27272a', roughness: 0.5 });
      const metalMat = new THREE.MeshStandardMaterial({ color: '#71717a', metalness: 0.8, roughness: 0.3 });

      // Chair Seat
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.14, 0.68), cushionMat);
      seat.position.set(0, 0.38, 0.05);
      seat.rotation.x = -0.1;
      group.add(this.applyShadows(seat));

      // Ergonomic Backrest
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.65, 0.12), cushionMat);
      back.position.set(0, 0.68, -0.26);
      back.rotation.x = -0.28;
      group.add(this.applyShadows(back));

      // Headrest
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.25, 0.1), cushionMat);
      head.position.set(0, 1.05, -0.38);
      head.rotation.x = -0.22;
      group.add(this.applyShadows(head));

      // Star Base Stem
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.26, 12), metalMat);
      stem.position.set(0, 0.13, -0.05);
      group.add(this.applyShadows(stem));

      // 4 Star Legs
      for (let i = 0; i < 4; i++) {
        const starLeg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.38), metalMat);
        starLeg.position.set(0, 0.03, -0.05);
        starLeg.rotation.y = (i * Math.PI) / 2 + Math.PI / 4;
        group.add(this.applyShadows(starLeg));
      }

      // Ottoman Footrest
      const ottomanSeat = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.12, 0.44), cushionMat);
      ottomanSeat.position.set(0, 0.35, 0.72);
      group.add(this.applyShadows(ottomanSeat));

      const ottomanStem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.25, 12), metalMat);
      ottomanStem.position.set(0, 0.125, 0.72);
      group.add(this.applyShadows(ottomanStem));

      for (let i = 0; i < 4; i++) {
        const oLeg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.025, 0.28), metalMat);
        oLeg.position.set(0, 0.025, 0.72);
        oLeg.rotation.y = (i * Math.PI) / 2;
        group.add(this.applyShadows(oLeg));
      }

      group.userData = {
        name: '모던 에르고 라운지 체어 & 오토만',
        category: '거실',
        colorables: colorables,
        type: 'lounge_chair'
      };

      return group;
    },

    /**
     * 7. 아치형 플로어 스탠드 조명 (Floor Arch Lamp)
     * 실제 PointLight 광원을 포함하여 야간 모드 시 은은한 조명 효과 연출
     */
    createFloorLamp(lampColor = '#d97706') {
      const group = new THREE.Group();
      const colorables = [];

      const brassMat = new THREE.MeshStandardMaterial({ color: '#d97706', metalness: 0.8, roughness: 0.3 });
      colorables.push(brassMat);

      const shadeMat = new THREE.MeshStandardMaterial({
        color: '#fffbeb',
        roughness: 0.9,
        emissive: '#f59e0b',
        emissiveIntensity: 0.4
      });

      // Heavy Round Marble Base
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.05, 32), brassMat);
      base.position.y = 0.025;
      group.add(this.applyShadows(base));

      // Tall Pole
      const pole1 = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.7, 16), brassMat);
      pole1.position.set(0, 0.88, 0);
      group.add(this.applyShadows(pole1));

      // Overhang Arm
      const pole2 = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.8, 16), brassMat);
      pole2.position.set(0.3, 1.85, 0);
      pole2.rotation.z = -Math.PI / 3;
      group.add(this.applyShadows(pole2));

      // Lamp Shade
      const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 0.28, 32, 1, true), shadeMat);
      shade.position.set(0.68, 1.8, 0);
      group.add(shade);

      // Emissive Light Bulb
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 16, 16),
        new THREE.MeshBasicMaterial({ color: '#ffedd5' })
      );
      bulb.position.set(0.68, 1.8, 0);
      group.add(bulb);

      // Embedded Real PointLight
      const lampLight = new THREE.PointLight('#fef08a', 0.85, 6, 2);
      lampLight.position.set(0.68, 1.76, 0);
      lampLight.castShadow = true;
      lampLight.shadow.bias = -0.002;
      group.add(lampLight);

      group.userData = {
        name: '아치형 플로어 무드 스탠드',
        category: '데코/조명',
        colorables: colorables,
        lampLight: lampLight,
        type: 'floor_lamp'
      };

      return group;
    },

    /**
     * 8. 몬스테라 대형 화분 (Monstera Plant)
     */
    createPlant() {
      const group = new THREE.Group();
      const colorables = [];

      const potMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 });
      colorables.push(potMat);

      const standMat = new THREE.MeshStandardMaterial({ color: '#92400e', roughness: 0.7 });
      const leafMat = new THREE.MeshStandardMaterial({
        color: '#15803d',
        roughness: 0.6,
        side: THREE.DoubleSide
      });
      const soilMat = new THREE.MeshStandardMaterial({ color: '#27272a', roughness: 0.95 });

      // Wooden Stand
      for (let i = 0; i < 4; i++) {
        const sLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.35, 12), standMat);
        const ang = (i * Math.PI) / 2 + 0.3;
        sLeg.position.set(Math.cos(ang) * 0.18, 0.175, Math.sin(ang) * 0.18);
        group.add(this.applyShadows(sLeg));
      }

      // Ceramic Cylinder Pot
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.42, 24), potMat);
      pot.position.y = 0.36;
      group.add(this.applyShadows(pot));

      // Potting Soil
      const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.05, 24), soilMat);
      soil.position.y = 0.54;
      group.add(soil);

      // Organic Monstera Stems & Leaves
      const stemMat = new THREE.MeshStandardMaterial({ color: '#166534', roughness: 0.8 });
      const leafAngles = [0, 0.9, 1.8, 2.7, 3.8, 4.7, 5.5];

      leafAngles.forEach((ang, idx) => {
        const stemLen = 0.45 + (idx % 3) * 0.1;
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, stemLen, 8), stemMat);
        stem.position.set(Math.cos(ang) * 0.06, 0.55 + stemLen / 2, Math.sin(ang) * 0.06);
        stem.rotation.z = Math.sin(ang) * 0.35;
        stem.rotation.x = Math.cos(ang) * 0.35;
        group.add(this.applyShadows(stem));

        // Leaf fan plane
        const leafGeo = new THREE.CircleGeometry(0.18, 12);
        leafGeo.scale(1, 1.4, 1);
        const leaf = new THREE.Mesh(leafGeo, leafMat);
        leaf.position.set(Math.cos(ang) * 0.22, 0.55 + stemLen, Math.sin(ang) * 0.22);
        leaf.rotation.x = Math.PI / 2.5 + Math.sin(ang) * 0.2;
        leaf.rotation.y = ang;
        group.add(this.applyShadows(leaf));
      });

      group.userData = {
        name: '보태니컬 몬스테라 대형 화분',
        category: '데코/조명',
        colorables: colorables,
        type: 'plant'
      };

      return group;
    },

    /**
     * 9. 아키텍처럴 다단 책장 (Modern Bookshelf)
     */
    createBookshelf(shelfColor = '#1e293b') {
      const group = new THREE.Group();
      const colorables = [];

      const woodMat = new THREE.MeshStandardMaterial({ color: shelfColor, roughness: 0.6 });
      colorables.push(woodMat);

      const metalMat = new THREE.MeshStandardMaterial({ color: '#09090b', roughness: 0.4, metalness: 0.8 });

      // 4 Metal Upright Frame Posts
      [[-0.6, -0.16], [0.6, -0.16], [-0.6, 0.16], [0.6, 0.16]].forEach(([px, pz]) => {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.95, 0.04), metalMat);
        post.position.set(px, 0.975, pz);
        group.add(this.applyShadows(post));
      });

      // 5 Shelves
      for (let s = 0; s < 5; s++) {
        const sy = 0.15 + s * 0.42;
        const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.035, 0.38), woodMat);
        shelf.position.set(0, sy, 0);
        group.add(this.applyShadows(shelf));

        // Procedural Books on shelves
        if (s > 0 && s < 4) {
          const bookColors = ['#dc2626', '#2563eb', '#16a34a', '#ca8a04', '#7c3aed', '#db2777'];
          const count = 5 + (s * 3) % 4;
          const startX = -0.45 + (s % 2) * 0.3;

          for (let b = 0; b < count; b++) {
            const bColor = bookColors[(s * 4 + b) % bookColors.length];
            const bookMat = new THREE.MeshStandardMaterial({ color: bColor, roughness: 0.8 });
            const bWidth = 0.03 + (b % 3) * 0.01;
            const bHeight = 0.22 + (b % 4) * 0.03;
            const book = new THREE.Mesh(new THREE.BoxGeometry(bWidth, bHeight, 0.22), bookMat);
            book.position.set(startX + b * 0.045, sy + bHeight / 2 + 0.018, 0);
            group.add(this.applyShadows(book));
          }
        }
      }

      // Decorative Vase on top shelf
      const vaseMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.2 });
      const vase = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.24, 16), vaseMat);
      vase.position.set(0.35, 1.83 + 0.12, 0);
      group.add(this.applyShadows(vase));

      group.userData = {
        name: '미니멀 오픈 5단 책장',
        category: '거실',
        colorables: colorables,
        type: 'bookshelf'
      };

      return group;
    },

    /**
     * 10. 거실 소파 테이블 (Coffee Table)
     */
    createCoffeeTable(woodColor = '#b08968') {
      const group = new THREE.Group();
      const colorables = [];

      const topMat = new THREE.MeshStandardMaterial({ color: woodColor, roughness: 0.5 });
      colorables.push(topMat);

      const legMat = new THREE.MeshStandardMaterial({ color: '#18181b', metalness: 0.8, roughness: 0.4 });

      // Round Capsule Tabletop
      const tabletop = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.04, 32), topMat);
      tabletop.position.set(0, 0.38, 0);
      group.add(this.applyShadows(tabletop));

      // 3 Angled Hairpin Legs
      for (let i = 0; i < 3; i++) {
        const ang = (i * Math.PI * 2) / 3;
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.01, 0.37, 12), legMat);
        leg.position.set(Math.cos(ang) * 0.38, 0.185, Math.sin(ang) * 0.38);
        leg.rotation.z = Math.cos(ang) * -0.15;
        leg.rotation.x = Math.sin(ang) * 0.15;
        group.add(this.applyShadows(leg));
      }

      // Ceramic Coffee Mug decor
      const mugMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 });
      const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.08, 16), mugMat);
      mug.position.set(0.12, 0.44, 0.05);
      group.add(this.applyShadows(mug));

      group.userData = {
        name: '라운드 오크 원목 소파 테이블',
        category: '거실',
        colorables: colorables,
        type: 'coffee_table'
      };

      return group;
    },

    /**
     * 11. 현대식 아일랜드 식탁 & 바체어 (Kitchen Island)
     */
    createKitchenIsland() {
      const group = new THREE.Group();
      const colorables = [];

      const quartzMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.2, metalness: 0.1 });
      const cabinetMat = new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.6 });
      colorables.push(cabinetMat);

      const chromeMat = new THREE.MeshStandardMaterial({ color: '#e2e8f0', metalness: 0.9, roughness: 0.15 });

      // Cabinet Base
      const cabinet = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.85, 0.9), cabinetMat);
      cabinet.position.set(0, 0.425, 0);
      group.add(this.applyShadows(cabinet));

      // Overhanging Quartz Countertop
      const counter = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.06, 1.1), quartzMat);
      counter.position.set(0, 0.88, 0);
      group.add(this.applyShadows(counter));

      // Undermount Sink
      const sinkMat = new THREE.MeshStandardMaterial({ color: '#94a3b8', metalness: 0.8, roughness: 0.3 });
      const sink = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.01, 0.4), sinkMat);
      sink.position.set(-0.45, 0.912, -0.05);
      group.add(sink);

      // Gooseneck Chrome Faucet
      const faucetBase = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.16, 12), chromeMat);
      faucetBase.position.set(-0.45, 0.99, -0.28);
      const faucetSpout = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.012, 8, 16, Math.PI), chromeMat);
      faucetSpout.position.set(-0.45, 1.07, -0.2);
      faucetSpout.rotation.y = Math.PI / 2;
      group.add(this.applyShadows(faucetBase), this.applyShadows(faucetSpout));

      // 2 Modern Barstools
      [-0.45, 0.45].forEach((bx) => {
        const stoolGroup = new THREE.Group();
        stoolGroup.position.set(bx, 0, 0.68);

        const sSeat = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.04, 24), quartzMat);
        sSeat.position.y = 0.65;
        stoolGroup.add(this.applyShadows(sSeat));

        const sStem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.63, 12), chromeMat);
        sStem.position.y = 0.315;
        stoolGroup.add(this.applyShadows(sStem));

        const sBase = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 24), chromeMat);
        sBase.position.y = 0.01;
        stoolGroup.add(this.applyShadows(sBase));

        group.add(stoolGroup);
      });

      group.userData = {
        name: '모던 쿼츠 키친 아일랜드 & 스툴',
        category: '주방/가전',
        colorables: colorables,
        type: 'kitchen_island'
      };

      return group;
    }
  };

  /**
   * =========================================================================
   * [확장 인터페이스 가이드] 외부 GLTF/GLB 3D 모델 로더 확장 포인트
   * =========================================================================
   * 추후 실제 3D 모델(GLTF/GLB)을 로드할 경우 아래 인터페이스를 활용할 수 있습니다.
   * 
   * 사용 방법:
   * 1. Three.js GLTFLoader CDN 추가:
   *    <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js"></script>
   * 
   * 2. 확장 함수 호출 예시:
   *    loadExternalModel('assets/models/sofa.glb', '프리미엄 디자이너 소파', '거실', 1.0);
   */
  function loadExternalModel(url, name, category, defaultScale = 1.0) {
    /*
    if (!THREE.GLTFLoader) {
      console.warn('GLTFLoader가 로드되지 않았습니다.');
      return;
    }
    const loader = new THREE.GLTFLoader();
    loader.load(url, (gltf) => {
      const model = gltf.scene;
      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      model.scale.set(defaultScale, defaultScale, defaultScale);
      model.userData = {
        name: name,
        category: category,
        colorables: [],
        type: 'custom_gltf'
      };
      placeFurnitureInRoom(model);
      showToast(`${name} 모델을 성공적으로 불러왔습니다.`);
    }, undefined, (error) => {
      console.error('GLTF 모델 로드 실패:', error);
      showToast('3D 모델을 불러오는 중 오류가 발생했습니다.');
    });
    */
  }

  // --------------------------------------------------------------------------
  // Catalog Registry
  // --------------------------------------------------------------------------
  const CATALOG_ITEMS = [
    {
      id: 'sofa',
      name: '3인용 모던 소파',
      category: 'living',
      dims: '2.3m × 0.95m',
      icon: '🛋️',
      create: () => FurnitureFactory.createSofa()
    },
    {
      id: 'lounge_chair',
      name: '라운지 체어 & 오토만',
      category: 'living',
      dims: '0.7m × 1.2m',
      icon: '🪑',
      create: () => FurnitureFactory.createLoungeChair()
    },
    {
      id: 'coffee_table',
      name: '오크 라운드 소파 테이블',
      category: 'living',
      dims: 'Ø 1.1m',
      icon: '☕',
      create: () => FurnitureFactory.createCoffeeTable()
    },
    {
      id: 'tv_unit',
      name: '65인치 TV & 미디어장',
      category: 'living',
      dims: '2.4m × 0.45m',
      icon: '📺',
      create: () => FurnitureFactory.createSmartTV()
    },
    {
      id: 'bookshelf',
      name: '모던 오픈 5단 책장',
      category: 'living',
      dims: '1.3m × 0.4m',
      icon: '📚',
      create: () => FurnitureFactory.createBookshelf()
    },
    {
      id: 'bed',
      name: '킹사이즈 침대 & 협탁',
      category: 'bedroom',
      dims: '2.8m × 2.2m',
      icon: '🛏️',
      create: () => FurnitureFactory.createBed()
    },
    {
      id: 'dining_set',
      name: '4인용 원목 식탁 세트',
      category: 'kitchen',
      dims: '1.6m × 1.2m',
      icon: '🍽️',
      create: () => FurnitureFactory.createDiningTable()
    },
    {
      id: 'kitchen_island',
      name: '키친 아일랜드 & 스툴',
      category: 'kitchen',
      dims: '2.2m × 1.1m',
      icon: '🍳',
      create: () => FurnitureFactory.createKitchenIsland()
    },
    {
      id: 'fridge',
      name: '4도어 메탈 냉장고',
      category: 'kitchen',
      dims: '0.95m × 0.85m',
      icon: '🧊',
      create: () => FurnitureFactory.createRefrigerator()
    },
    {
      id: 'floor_lamp',
      name: '아치형 플로어 스탠드',
      category: 'decor',
      dims: '0.9m × 2.0m',
      icon: '💡',
      create: () => FurnitureFactory.createFloorLamp()
    },
    {
      id: 'plant',
      name: '몬스테라 대형 화분',
      category: 'decor',
      dims: '0.6m × 1.1m',
      icon: '🪴',
      create: () => FurnitureFactory.createPlant()
    }
  ];

  // --------------------------------------------------------------------------
  // Core Three.js Initialization
  // --------------------------------------------------------------------------
  function initThree() {
    canvasContainer = document.getElementById('canvas-container');

    // 1. Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color('#090d16');
    scene.fog = new THREE.FogExp2('#090d16', 0.018);

    // 2. Camera (Isometric Perspective)
    camera = new THREE.PerspectiveCamera(
      42,
      canvasContainer.clientWidth / canvasContainer.clientHeight,
      0.1,
      1000
    );
    camera.position.set(9.5, 8.5, 9.5);

    // 3. WebGL Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    canvasContainer.appendChild(renderer.domElement);

    // 4. OrbitControls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 1.2, 0);
    controls.maxPolarAngle = Math.PI / 2 - 0.03; // Keep above floor
    controls.minDistance = 2;
    controls.maxDistance = 28;

    // 5. Build Room Structure
    buildRoom();

    // 6. Lighting Setup
    setupLighting();

    // 7. Raycasting & Interaction Setup
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();
    dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    dragIntersection = new THREE.Vector3();
    dragOffset = new THREE.Vector3();

    // Selection Bounding Box Helper
    selectionHelper = new THREE.BoxHelper(new THREE.Mesh(), 0x6366f1);
    selectionHelper.visible = false;
    selectionHelper.material.depthTest = false;
    selectionHelper.material.linewidth = 2;
    scene.add(selectionHelper);

    // 8. Event Listeners
    setupInteractionEvents();
    window.addEventListener('resize', onWindowResize);

    // 9. Animation Loop
    animate();
  }

  /**
   * 3D 방 기본 구조 (바닥, 3면 벽체, 걸레받이, 창문 채광) 생성
   */
  function buildRoom() {
    const { width, depth, height } = state.room;

    // --- Floor ---
    floorMaterial = new THREE.MeshStandardMaterial({
      roughness: 0.45,
      metalness: 0.1
    });
    updateFloorTexture(state.room.floorType);

    const floorGeo = new THREE.PlaneGeometry(width, depth);
    floorMesh = new THREE.Mesh(floorGeo, floorMaterial);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.receiveShadow = true;
    floorMesh.userData = { isFloor: true };
    scene.add(floorMesh);

    // Floor Grid Helper (0.5m interval)
    floorGrid = new THREE.GridHelper(Math.max(width, depth), 20, 0x6366f1, 0x1e293b);
    floorGrid.position.y = 0.003;
    scene.add(floorGrid);

    // --- Walls (Back, Left, Right) ---
    const wallMat = new THREE.MeshStandardMaterial({
      color: state.room.wallColor,
      roughness: 0.9,
      metalness: 0.0
    });

    // Back Wall (Z = -depth/2)
    const backGeo = new THREE.PlaneGeometry(width, height);
    wallBack = new THREE.Mesh(backGeo, wallMat);
    wallBack.position.set(0, height / 2, -depth / 2);
    wallBack.receiveShadow = true;
    scene.add(wallBack);

    // Left Wall (X = -width/2)
    const leftGeo = new THREE.PlaneGeometry(depth, height);
    wallLeft = new THREE.Mesh(leftGeo, wallMat);
    wallLeft.position.set(-width / 2, height / 2, 0);
    wallLeft.rotation.y = Math.PI / 2;
    wallLeft.receiveShadow = true;
    scene.add(wallLeft);

    // Right Wall (X = +width/2)
    const rightGeo = new THREE.PlaneGeometry(depth, height);
    wallRight = new THREE.Mesh(rightGeo, wallMat);
    wallRight.position.set(width / 2, height / 2, 0);
    wallRight.rotation.y = -Math.PI / 2;
    wallRight.receiveShadow = true;
    scene.add(wallRight);

    // --- Baseboard Trim Moldings ---
    baseboardGroup = new THREE.Group();
    const trimMat = new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.6 });

    const trimBack = new THREE.Mesh(new THREE.BoxGeometry(width, 0.12, 0.02), trimMat);
    trimBack.position.set(0, 0.06, -depth / 2 + 0.01);
    const trimLeft = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.12, depth), trimMat);
    trimLeft.position.set(-width / 2 + 0.01, 0.06, 0);
    const trimRight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.12, depth), trimMat);
    trimRight.position.set(width / 2 - 0.01, 0.06, 0);

    baseboardGroup.add(trimBack, trimLeft, trimRight);
    scene.add(baseboardGroup);
  }

  /**
   * 조명 시스템 (AmbientLight, HemisphereLight, DirectionalLight with Shadows)
   */
  function setupLighting() {
    // Ambient Light
    ambientLight = new THREE.AmbientLight('#ffffff', 0.55);
    scene.add(ambientLight);

    // Hemisphere Light (Realistic sky vs ground reflection)
    hemiLight = new THREE.HemisphereLight('#f1f5f9', '#334155', 0.4);
    hemiLight.position.set(0, 15, 0);
    scene.add(hemiLight);

    // Directional Sunlight (Casts soft realistic shadows)
    dirLight = new THREE.DirectionalLight('#fff7ed', 1.0);
    dirLight.position.set(12, 16, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 40;
    dirLight.shadow.bias = -0.0003;
    
    // Shadow Bounds encompassing room
    const d = 8;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    scene.add(dirLight);

    // Night Mode Ambient Fill Light
    nightRoomLight = new THREE.PointLight('#fef08a', 0, 12, 2);
    nightRoomLight.position.set(0, 2.8, 0);
    scene.add(nightRoomLight);
  }

  /**
   * 바닥재 텍스처 교체 로직
   */
  function updateFloorTexture(type) {
    state.room.floorType = type;
    let texture = null;

    if (type === 'wood') {
      texture = TextureGenerator.createWood();
      floorMaterial.roughness = 0.45;
      floorMaterial.metalness = 0.05;
    } else if (type === 'marble') {
      texture = TextureGenerator.createMarble();
      floorMaterial.roughness = 0.15;
      floorMaterial.metalness = 0.1;
    } else if (type === 'tile') {
      texture = TextureGenerator.createTile();
      floorMaterial.roughness = 0.35;
      floorMaterial.metalness = 0.05;
    } else if (type === 'concrete') {
      texture = TextureGenerator.createConcrete();
      floorMaterial.roughness = 0.85;
      floorMaterial.metalness = 0.0;
    }

    floorMaterial.map = texture;
    floorMaterial.needsUpdate = true;
  }

  /**
   * 벽지 색상 & 패턴 일괄 업데이트
   */
  function updateWallMaterial() {
    const patternTexture = TextureGenerator.createWallPattern(state.room.wallPattern, state.room.wallColor);
    const wallColorObj = new THREE.Color(state.room.wallColor);

    [wallBack, wallLeft, wallRight].forEach((wall) => {
      if (wall) {
        wall.material.color = wallColorObj;
        wall.material.map = patternTexture;
        wall.material.needsUpdate = true;
      }
    });
  }

  /**
   * 주간(Day) / 야간(Night) 조명 모드 전환
   */
  function toggleLightingMode() {
    state.lighting.isDay = !state.lighting.isDay;
    const isDay = state.lighting.isDay;

    if (isDay) {
      scene.background.set('#090d16');
      scene.fog.color.set('#090d16');
      ambientLight.color.set('#ffffff');
      ambientLight.intensity = 0.55;
      hemiLight.intensity = 0.4;
      dirLight.intensity = 1.0;
      dirLight.color.set('#fff7ed');
      nightRoomLight.intensity = 0;

      // Floor lamps dim
      state.placedItems.forEach((item) => {
        if (item.userData.lampLight) item.userData.lampLight.intensity = 0.5;
      });

      DOM.btnToggleLight.querySelector('.icon').textContent = '☀️';
      DOM.btnToggleLight.querySelector('.btn-text').textContent = '주간 모드';
      showToast('주간 자연광 모드로 전환되었습니다.');
    } else {
      scene.background.set('#020617');
      scene.fog.color.set('#020617');
      ambientLight.color.set('#1e293b');
      ambientLight.intensity = 0.18;
      hemiLight.intensity = 0.12;
      dirLight.intensity = 0.15;
      dirLight.color.set('#38bdf8');
      nightRoomLight.intensity = 1.2;

      // Floor lamps glowing brightly
      state.placedItems.forEach((item) => {
        if (item.userData.lampLight) item.userData.lampLight.intensity = 2.2;
      });

      DOM.btnToggleLight.querySelector('.icon').textContent = '🌙';
      DOM.btnToggleLight.querySelector('.btn-text').textContent = '야간 모드';
      showToast('아늑한 야간 무드등 모드로 전환되었습니다.');
    }
  }

  // --------------------------------------------------------------------------
  // Raycasting, Drag-and-Drop & Selection Interaction
  // --------------------------------------------------------------------------
  function setupInteractionEvents() {
    const canvas = renderer.domElement;

    // Pointer Down (Selection & Drag Start)
    canvas.addEventListener('pointerdown', (e) => {
      // Left click only
      if (e.button !== 0) return;

      updateMouseCoords(e);
      raycaster.setFromCamera(mouse, camera);

      // Check intersect with placed furniture
      const interactiveMeshes = [];
      state.placedItems.forEach((grp) => {
        grp.traverse((child) => {
          if (child.isMesh) {
            child.userData.parentFurniture = grp;
            interactiveMeshes.push(child);
          }
        });
      });

      const hits = raycaster.intersectObjects(interactiveMeshes, false);

      if (hits.length > 0) {
        const topFurniture = hits[0].object.userData.parentFurniture;
        if (topFurniture) {
          selectFurniture(topFurniture);

          // Prepare floor plane dragging
          state.isDragging = true;
          controls.enabled = false; // Disable orbit controls during drag

          if (raycaster.ray.intersectPlane(dragPlane, dragIntersection)) {
            dragOffset.copy(topFurniture.position).sub(dragIntersection);
          }

          DOM.dragIndicator.classList.add('active');
          canvas.style.cursor = 'grabbing';
          return;
        }
      }

      // If clicked empty space, deselect
      if (!state.isDragging) {
        deselectFurniture();
      }
    });

    // Pointer Move (Dragging on Ground & Hover Cursor)
    window.addEventListener('pointermove', (e) => {
      updateMouseCoords(e);

      if (state.isDragging && state.selectedObject) {
        raycaster.setFromCamera(mouse, camera);

        if (raycaster.ray.intersectPlane(dragPlane, dragIntersection)) {
          let targetX = dragIntersection.x + dragOffset.x;
          let targetZ = dragIntersection.z + dragOffset.z;

          // Shift key: Snap to 0.25m grid
          if (e.shiftKey) {
            targetX = Math.round(targetX / 0.25) * 0.25;
            targetZ = Math.round(targetZ / 0.25) * 0.25;
          }

          // Clamp within room boundaries
          const limitX = state.room.width / 2 - 0.45;
          const limitZ = state.room.depth / 2 - 0.45;
          targetX = Math.max(-limitX, Math.min(limitX, targetX));
          targetZ = Math.max(-limitZ, Math.min(limitZ, targetZ));

          state.selectedObject.position.x = targetX;
          state.selectedObject.position.z = targetZ;

          // Sync selection box & inspector inputs
          selectionHelper.update();
          syncInspectorWithObject(state.selectedObject);
        }
      } else {
        // Hover cursor check
        raycaster.setFromCamera(mouse, camera);
        const interactiveMeshes = [];
        state.placedItems.forEach((grp) => {
          grp.traverse((c) => { if (c.isMesh) interactiveMeshes.push(c); });
        });
        const hits = raycaster.intersectObjects(interactiveMeshes, false);
        canvas.style.cursor = hits.length > 0 ? 'grab' : 'default';
      }
    });

    // Pointer Up (End Dragging)
    window.addEventListener('pointerup', () => {
      if (state.isDragging) {
        state.isDragging = false;
        controls.enabled = true;
        DOM.dragIndicator.classList.remove('active');
        canvas.style.cursor = 'grab';
      }
    });

    // Keyboard Shortcuts (R: Rotate, Delete: Remove, Esc: Deselect)
    window.addEventListener('keydown', (e) => {
      // Ignore if typing in text inputs
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

      if (!state.selectedObject) return;

      if (e.key === 'r' || e.key === 'R') {
        rotateSelectedObject(Math.PI / 2);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        deleteSelectedFurniture();
      } else if (e.key === 'Escape') {
        deselectFurniture();
      } else if (e.ctrlKey && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        duplicateSelectedFurniture();
      }
    });
  }

  function updateMouseCoords(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  /**
   * 가구 오브젝트 선택 및 인스펙터 활성화
   */
  function selectFurniture(furnitureGroup) {
    state.selectedObject = furnitureGroup;

    // Attach BoxHelper
    selectionHelper.setFromObject(furnitureGroup);
    selectionHelper.visible = true;

    // Open Inspector Panel & Populate
    DOM.inspectorPanel.classList.add('active');
    syncInspectorWithObject(furnitureGroup);

    // Update active highlight in Layers tab
    updateLayersListUI();
  }

  /**
   * 선택 해제
   */
  function deselectFurniture() {
    state.selectedObject = null;
    selectionHelper.visible = false;
    DOM.inspectorPanel.classList.remove('active');
    updateLayersListUI();
  }

  /**
   * 오브젝트의 현재 위치/회전/스케일을 인스펙터 UI에 동기화
   */
  function syncInspectorWithObject(obj) {
    if (!obj) return;

    DOM.inspName.textContent = obj.userData.name || '인테리어 가구';
    DOM.inspCategory.textContent = obj.userData.category || '가구';

    // Position
    DOM.sliderPosX.value = obj.position.x;
    DOM.valPosX.textContent = `${obj.position.x.toFixed(2)}m`;
    DOM.sliderPosZ.value = obj.position.z;
    DOM.valPosZ.textContent = `${obj.position.z.toFixed(2)}m`;
    DOM.sliderPosY.value = obj.position.y;
    DOM.valPosY.textContent = `${obj.position.y.toFixed(2)}m`;

    // Rotation (Y axis)
    const deg = Math.round(THREE.MathUtils.radToDeg(obj.rotation.y)) % 360;
    const normalizedDeg = deg < 0 ? deg + 360 : deg;
    DOM.sliderRotY.value = normalizedDeg;
    DOM.valRotY.textContent = `${normalizedDeg}°`;

    // Scale
    DOM.sliderScale.value = obj.scale.x;
    DOM.valScale.textContent = `${obj.scale.x.toFixed(2)}x`;
  }

  /**
   * 방 안에 가구 생성 및 배치
   */
  function placeFurnitureInRoom(furnitureGroup, position = null) {
    if (position) {
      furnitureGroup.position.copy(position);
    } else {
      // Default: Spawn slightly jittered around center to prevent direct stacking
      const jitterX = (Math.random() - 0.5) * 1.2;
      const jitterZ = (Math.random() - 0.5) * 1.2;
      furnitureGroup.position.set(jitterX, 0, jitterZ);
    }

    // Set unique instance ID
    furnitureGroup.userData.instanceId = 'inst_' + Date.now() + '_' + Math.floor(Math.random() * 1000);

    scene.add(furnitureGroup);
    state.placedItems.push(furnitureGroup);

    // Update UI Stats & Layers
    updatePlacedStats();
    updateLayersListUI();

    // Auto-select newly added item
    selectFurniture(furnitureGroup);
    showToast(`'${furnitureGroup.userData.name}'이(가) 배치되었습니다.`);
  }

  /**
   * 선택된 가구 90도 또는 지정 각도 회전
   */
  function rotateSelectedObject(deltaRadians) {
    if (!state.selectedObject) return;
    state.selectedObject.rotation.y += deltaRadians;
    selectionHelper.update();
    syncInspectorWithObject(state.selectedObject);
  }

  /**
   * 선택된 가구 복제
   */
  function duplicateSelectedFurniture() {
    if (!state.selectedObject) return;
    const src = state.selectedObject;
    const catalogItem = CATALOG_ITEMS.find((c) => c.id === src.userData.type);

    if (catalogItem) {
      const clone = catalogItem.create();
      clone.rotation.y = src.rotation.y;
      clone.scale.copy(src.scale);

      // Copy custom color if available
      if (src.userData.customColor && clone.userData.colorables) {
        clone.userData.customColor = src.userData.customColor;
        clone.userData.colorables.forEach((mat) => mat.color.set(src.userData.customColor));
      }

      const offsetPos = src.position.clone().add(new THREE.Vector3(0.4, 0, 0.4));
      placeFurnitureInRoom(clone, offsetPos);
    }
  }

  /**
   * 선택된 가구 삭제
   */
  function deleteSelectedFurniture() {
    if (!state.selectedObject) return;
    const item = state.selectedObject;

    scene.remove(item);
    state.placedItems = state.placedItems.filter((i) => i !== item);

    // Deep dispose meshes & materials
    item.traverse((child) => {
      if (child.isMesh) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
          else child.material.dispose();
        }
      }
    });

    deselectFurniture();
    updatePlacedStats();
    updateLayersListUI();
    showToast('선택한 가구가 삭제되었습니다.');
  }

  /**
   * 모든 가구 비우기
   */
  function clearAllFurniture() {
    if (state.placedItems.length === 0) {
      showToast('배치된 가구가 없습니다.');
      return;
    }

    if (!confirm('정말로 모든 가구를 방에서 제거하시겠습니까?')) return;

    state.placedItems.forEach((item) => {
      scene.remove(item);
      item.traverse((child) => {
        if (child.isMesh) {
          if (child.geometry) child.geometry.dispose();
          if (child.material) child.material.dispose();
        }
      });
    });

    state.placedItems = [];
    deselectFurniture();
    updatePlacedStats();
    updateLayersListUI();
    showToast('방이 깨끗하게 초기화되었습니다.');
  }

  // --------------------------------------------------------------------------
  // Camera Views (3D Perspective, 2D Top-Down, Eye-Level)
  // --------------------------------------------------------------------------
  function setCameraView(mode) {
    document.querySelectorAll('.view-presets .tool-btn').forEach((b) => b.classList.remove('active'));

    if (mode === 'iso') {
      DOM.btnViewIso.classList.add('active');
      tweenCamera({ x: 9.5, y: 8.5, z: 9.5 }, { x: 0, y: 1.2, z: 0 });
    } else if (mode === 'top') {
      DOM.btnViewTop.classList.add('active');
      tweenCamera({ x: 0.001, y: 14.5, z: 0 }, { x: 0, y: 0, z: 0 });
    } else if (mode === 'eye') {
      DOM.btnViewEye.classList.add('active');
      tweenCamera({ x: 0, y: 1.4, z: 3.6 }, { x: 0, y: 1.2, z: -1.5 });
    }
  }

  /**
   * 카메라 부드러운 위치 이동
   */
  function tweenCamera(targetPos, targetLookAt) {
    camera.position.set(targetPos.x, targetPos.y, targetPos.z);
    controls.target.set(targetLookAt.x, targetLookAt.y, targetLookAt.z);
    controls.update();
  }

  // --------------------------------------------------------------------------
  // UI & Event Handlers Wiring
  // --------------------------------------------------------------------------
  function cacheDOMElements() {
    DOM.placedCount = document.getElementById('placed-items-count');
    DOM.catalogGrid = document.getElementById('catalog-grid');
    DOM.layersList = document.getElementById('layers-list');
    DOM.dragIndicator = document.getElementById('drag-indicator');
    DOM.toast = document.getElementById('toast');

    // Header buttons
    DOM.btnViewIso = document.getElementById('btn-view-iso');
    DOM.btnViewTop = document.getElementById('btn-view-top');
    DOM.btnViewEye = document.getElementById('btn-view-eye');
    DOM.btnToggleLight = document.getElementById('btn-toggle-light');
    DOM.btnToggleGrid = document.getElementById('btn-toggle-grid');
    DOM.btnResetCam = document.getElementById('btn-reset-cam');
    DOM.btnSavePlan = document.getElementById('btn-save-plan');
    DOM.btnClearScene = document.getElementById('btn-clear-scene');

    // Sidebar
    DOM.tabBtns = document.querySelectorAll('.tab-btn');
    DOM.tabContents = document.querySelectorAll('.tab-content');
    DOM.filterChips = document.querySelectorAll('.filter-chip');
    DOM.floorOptions = document.querySelectorAll('.finish-card[data-floor]');
    DOM.wallSwatches = document.querySelectorAll('.color-swatch[data-color]');
    DOM.wallPatternSelect = document.getElementById('wall-pattern-select');
    DOM.chkWalls = document.getElementById('chk-toggle-side-walls');
    DOM.btnSelectNone = document.getElementById('btn-select-none');

    // Inspector
    DOM.inspectorPanel = document.getElementById('inspector-panel');
    DOM.btnCloseInspector = document.getElementById('btn-close-inspector');
    DOM.inspName = document.getElementById('insp-name');
    DOM.inspCategory = document.getElementById('insp-category');

    DOM.sliderPosX = document.getElementById('slider-pos-x');
    DOM.sliderPosZ = document.getElementById('slider-pos-z');
    DOM.sliderPosY = document.getElementById('slider-pos-y');
    DOM.valPosX = document.getElementById('val-pos-x');
    DOM.valPosZ = document.getElementById('val-pos-z');
    DOM.valPosY = document.getElementById('val-pos-y');

    DOM.sliderRotY = document.getElementById('slider-rot-y');
    DOM.valRotY = document.getElementById('val-rot-y');
    DOM.sliderScale = document.getElementById('slider-scale');
    DOM.valScale = document.getElementById('val-scale');

    DOM.inspBtnRotateLeft = document.getElementById('insp-btn-rotate-left');
    DOM.inspBtnRotateRight = document.getElementById('insp-btn-rotate-right');
    DOM.inspBtnCenter = document.getElementById('insp-btn-center');
    DOM.inspBtnDuplicate = document.getElementById('insp-btn-duplicate');
    DOM.inspBtnDelete = document.getElementById('insp-btn-delete');
    DOM.colorDots = document.querySelectorAll('.color-dot');
  }

  function bindUIEvents() {
    // 1. Sidebar Tabs Switching
    DOM.tabBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        DOM.tabBtns.forEach((b) => b.classList.remove('active'));
        DOM.tabContents.forEach((c) => c.classList.remove('active'));

        btn.classList.add('active');
        const tabId = `tab-${btn.dataset.tab}`;
        const target = document.getElementById(tabId);
        if (target) target.classList.add('active');
      });
    });

    // 2. Catalog Category Filters
    DOM.filterChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        DOM.filterChips.forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        renderCatalog(chip.dataset.category);
      });
    });

    // 3. Floor Finishes
    DOM.floorOptions.forEach((card) => {
      card.addEventListener('click', () => {
        DOM.floorOptions.forEach((c) => c.classList.remove('active'));
        card.classList.add('active');
        updateFloorTexture(card.dataset.floor);
        showToast(`바닥재가 '${card.querySelector('.finish-name').textContent}'(으)로 변경되었습니다.`);
      });
    });

    // 4. Wall Color & Pattern
    DOM.wallSwatches.forEach((swatch) => {
      swatch.addEventListener('click', () => {
        DOM.wallSwatches.forEach((s) => s.classList.remove('active'));
        swatch.classList.add('active');
        state.room.wallColor = swatch.dataset.color;
        updateWallMaterial();
      });
    });

    DOM.wallPatternSelect.addEventListener('change', (e) => {
      state.room.wallPattern = e.target.value;
      updateWallMaterial();
    });

    DOM.chkWalls.addEventListener('change', (e) => {
      const show = e.target.checked;
      wallLeft.visible = show;
      wallRight.visible = show;
    });

    // 5. Camera Views
    DOM.btnViewIso.addEventListener('click', () => setCameraView('iso'));
    DOM.btnViewTop.addEventListener('click', () => setCameraView('top'));
    DOM.btnViewEye.addEventListener('click', () => setCameraView('eye'));

    // 6. Lighting & Grid & Reset
    DOM.btnToggleLight.addEventListener('click', toggleLightingMode);
    DOM.btnToggleGrid.addEventListener('click', () => {
      floorGrid.visible = !floorGrid.visible;
      DOM.btnToggleGrid.classList.toggle('active', floorGrid.visible);
    });
    DOM.btnResetCam.addEventListener('click', () => {
      setCameraView('iso');
      showToast('카메라 뷰가 초기화되었습니다.');
    });

    DOM.btnSavePlan.addEventListener('click', saveRoomLayout);
    DOM.btnClearScene.addEventListener('click', clearAllFurniture);
    DOM.btnSelectNone.addEventListener('click', deselectFurniture);

    // 7. Inspector Transform Events
    DOM.btnCloseInspector.addEventListener('click', deselectFurniture);

    // Position X Slider
    DOM.sliderPosX.addEventListener('input', (e) => {
      if (!state.selectedObject) return;
      const v = parseFloat(e.target.value);
      state.selectedObject.position.x = v;
      DOM.valPosX.textContent = `${v.toFixed(2)}m`;
      selectionHelper.update();
    });

    // Position Z Slider
    DOM.sliderPosZ.addEventListener('input', (e) => {
      if (!state.selectedObject) return;
      const v = parseFloat(e.target.value);
      state.selectedObject.position.z = v;
      DOM.valPosZ.textContent = `${v.toFixed(2)}m`;
      selectionHelper.update();
    });

    // Position Y (Elevation) Slider
    DOM.sliderPosY.addEventListener('input', (e) => {
      if (!state.selectedObject) return;
      const v = parseFloat(e.target.value);
      state.selectedObject.position.y = v;
      DOM.valPosY.textContent = `${v.toFixed(2)}m`;
      selectionHelper.update();
    });

    // Rotation Y Slider
    DOM.sliderRotY.addEventListener('input', (e) => {
      if (!state.selectedObject) return;
      const deg = parseInt(e.target.value, 10);
      state.selectedObject.rotation.y = THREE.MathUtils.degToRad(deg);
      DOM.valRotY.textContent = `${deg}°`;
      selectionHelper.update();
    });

    // Scale Slider
    DOM.sliderScale.addEventListener('input', (e) => {
      if (!state.selectedObject) return;
      const s = parseFloat(e.target.value);
      state.selectedObject.scale.set(s, s, s);
      DOM.valScale.textContent = `${s.toFixed(2)}x`;
      selectionHelper.update();
    });

    // Inspector Quick Action Buttons
    DOM.inspBtnRotateLeft.addEventListener('click', () => rotateSelectedObject(-Math.PI / 4));
    DOM.inspBtnRotateRight.addEventListener('click', () => rotateSelectedObject(Math.PI / 4));
    DOM.inspBtnCenter.addEventListener('click', () => {
      if (!state.selectedObject) return;
      state.selectedObject.position.x = 0;
      state.selectedObject.position.z = 0;
      selectionHelper.update();
      syncInspectorWithObject(state.selectedObject);
    });
    DOM.inspBtnDuplicate.addEventListener('click', duplicateSelectedFurniture);
    DOM.inspBtnDelete.addEventListener('click', deleteSelectedFurniture);

    // Color Tint Dots for Furniture Fabric/Body
    DOM.colorDots.forEach((dot) => {
      dot.addEventListener('click', () => {
        if (!state.selectedObject) return;
        const color = dot.dataset.color;
        state.selectedObject.userData.customColor = color;
        if (state.selectedObject.userData.colorables) {
          state.selectedObject.userData.colorables.forEach((mat) => {
            mat.color.set(color);
          });
        }
        DOM.colorDots.forEach((d) => d.classList.remove('active'));
        dot.classList.add('active');
        showToast('가구의 컬러가 변경되었습니다.');
      });
    });
  }

  /**
   * 카탈로그 카드 렌더링
   */
  function renderCatalog(category = 'all') {
    DOM.catalogGrid.innerHTML = '';

    const filtered = category === 'all'
      ? CATALOG_ITEMS
      : CATALOG_ITEMS.filter((item) => item.category === category);

    filtered.forEach((item) => {
      const card = document.createElement('div');
      card.className = 'catalog-card';
      card.innerHTML = `
        <div class="catalog-card-icon">${item.icon}</div>
        <div class="catalog-card-meta">
          <span class="catalog-card-name">${item.name}</span>
          <span class="catalog-card-dims">${item.dims}</span>
        </div>
        <div class="catalog-card-add-btn">
          <span>+ 공간에 배치</span>
        </div>
      `;

      card.addEventListener('click', () => {
        const obj = item.create();
        placeFurnitureInRoom(obj);
      });

      DOM.catalogGrid.appendChild(card);
    });
  }

  /**
   * 배치된 가구 레이어 리스트 UI 갱신
   */
  function updateLayersListUI() {
    if (!DOM.layersList) return;
    DOM.layersList.innerHTML = '';

    if (state.placedItems.length === 0) {
      DOM.layersList.innerHTML = `
        <div style="text-align:center; padding: 24px 12px; color: var(--text-dim); font-size:12px;">
          아직 배치된 가구가 없습니다.<br>좌측 카탈로그에서 가구를 추가해보세요.
        </div>
      `;
      return;
    }

    state.placedItems.forEach((item) => {
      const isSelected = state.selectedObject === item;
      const catalogItem = CATALOG_ITEMS.find((c) => c.id === item.userData.type);
      const icon = catalogItem ? catalogItem.icon : '📦';

      const row = document.createElement('div');
      row.className = `layer-item ${isSelected ? 'active' : ''}`;
      row.innerHTML = `
        <div class="layer-item-info">
          <span class="layer-icon">${icon}</span>
          <span class="layer-name">${item.userData.name}</span>
        </div>
        <button class="layer-del-btn" title="아이템 삭제">✕</button>
      `;

      // Select row
      row.addEventListener('click', (e) => {
        if (e.target.classList.contains('layer-del-btn')) return;
        selectFurniture(item);
      });

      // Delete specific item
      const delBtn = row.querySelector('.layer-del-btn');
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        selectFurniture(item);
        deleteSelectedFurniture();
      });

      DOM.layersList.appendChild(row);
    });
  }

  /**
   * 배치 카운트 업데이트
   */
  function updatePlacedStats() {
    if (DOM.placedCount) {
      DOM.placedCount.textContent = `${state.placedItems.length}개`;
    }
  }

  /**
   * 토스트 메시지 출력
   */
  let toastTimer = null;
  function showToast(msg) {
    if (!DOM.toast) return;
    DOM.toast.textContent = msg;
    DOM.toast.classList.add('show');

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      DOM.toast.classList.remove('show');
    }, 2800);
  }

  /**
   * 현재 방 레이아웃 로컬스토리지 저장
   */
  function saveRoomLayout() {
    const layout = {
      room: state.room,
      lighting: state.lighting,
      items: state.placedItems.map((item) => ({
        type: item.userData.type,
        pos: { x: item.position.x, y: item.position.y, z: item.position.z },
        rot: { x: item.rotation.x, y: item.rotation.y, z: item.rotation.z },
        scale: { x: item.scale.x, y: item.scale.y, z: item.scale.z },
        customColor: item.userData.customColor || null
      }))
    };

    try {
      localStorage.setItem('roomcraft_3d_saved_layout', JSON.stringify(layout));
      showToast('현재 공간 배치 구성이 브라우저에 안전하게 저장되었습니다!');
    } catch (e) {
      console.error('배치 저장 실패:', e);
      showToast('저장 공간 한도로 인해 실패했습니다.');
    }
  }

  /**
   * 저장된 레이아웃 복원 또는 기본 스타터 가구 세팅
   */
  function loadInitialScene() {
    const saved = localStorage.getItem('roomcraft_3d_saved_layout');

    if (saved) {
      try {
        const layout = JSON.parse(saved);
        if (layout.items && layout.items.length > 0) {
          layout.items.forEach((savedItem) => {
            const cat = CATALOG_ITEMS.find((c) => c.id === savedItem.type);
            if (cat) {
              const obj = cat.create();
              obj.position.set(savedItem.pos.x, savedItem.pos.y, savedItem.pos.z);
              obj.rotation.set(savedItem.rot.x, savedItem.rot.y, savedItem.rot.z);
              obj.scale.set(savedItem.scale.x, savedItem.scale.y, savedItem.scale.z);
              if (savedItem.customColor && obj.userData.colorables) {
                obj.userData.customColor = savedItem.customColor;
                obj.userData.colorables.forEach((m) => m.color.set(savedItem.customColor));
              }
              placeFurnitureInRoom(obj, obj.position);
            }
          });
          deselectFurniture();
          showToast('이전에 저장했던 인테리어 구성을 불러왔습니다.');
          return;
        }
      } catch (err) {
        console.warn('저장 데이터 파싱 오류:', err);
      }
    }

    // Default Starter Setup: Cozy Living Room Showroom
    // 1. Sofa
    const sofa = FurnitureFactory.createSofa('#475569');
    sofa.position.set(0, 0, 1.2);
    placeFurnitureInRoom(sofa, sofa.position);

    // 2. Coffee Table
    const coffeeTable = FurnitureFactory.createCoffeeTable();
    coffeeTable.position.set(0, 0, -0.2);
    placeFurnitureInRoom(coffeeTable, coffeeTable.position);

    // 3. TV & Console
    const tv = FurnitureFactory.createSmartTV();
    tv.position.set(0, 0, -3.4);
    placeFurnitureInRoom(tv, tv.position);

    // 4. Floor Lamp
    const lamp = FurnitureFactory.createFloorLamp();
    lamp.position.set(-2.8, 0, 1.4);
    lamp.rotation.y = 0.5;
    placeFurnitureInRoom(lamp, lamp.position);

    // 5. Monstera Plant
    const plant = FurnitureFactory.createPlant();
    plant.position.set(2.6, 0, -3.1);
    placeFurnitureInRoom(plant, plant.position);

    // 6. Lounge Chair
    const lounge = FurnitureFactory.createLoungeChair('#059669');
    lounge.position.set(-2.2, 0, -0.4);
    lounge.rotation.y = 0.8;
    placeFurnitureInRoom(lounge, lounge.position);

    // Select Sofa by default
    selectFurniture(sofa);
  }

  // --------------------------------------------------------------------------
  // Resize & Main Render Loop
  // --------------------------------------------------------------------------
  function onWindowResize() {
    if (!canvasContainer || !camera || !renderer) return;
    camera.aspect = canvasContainer.clientWidth / canvasContainer.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
  }

  function animate() {
    requestAnimationFrame(animate);

    // Update Controls Damping
    controls.update();

    // Render 3D Scene
    renderer.render(scene, camera);
  }

  // --------------------------------------------------------------------------
  // Application Entry Point
  // --------------------------------------------------------------------------
  window.addEventListener('DOMContentLoaded', () => {
    cacheDOMElements();
    bindUIEvents();
    renderCatalog('all');
    initThree();
    loadInitialScene();
  });

})();
