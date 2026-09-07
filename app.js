/**
 * ============================================================================
 * RoomCraft 3D Studio - Core Application Logic
 * Vanilla JavaScript (ES6+) & Three.js (r128)
 * Architectural Multi-Room Simulator & Blueprint Projection Engine
 * ============================================================================
 */

(function() {
  'use strict';

  // --------------------------------------------------------------------------
  // 1. Global Application State
  // --------------------------------------------------------------------------
  const state = {
    furnitureScale: 0.8, // Default: 80% (20평형대 아파트 평면도에 최적화된 컴팩트 규격)
    floorplan: {
      preset: 'apartment', // 'apartment' (첨부 도면 1:1) or 'open_studio'
      wallHeightMode: 'low', // 'low' (1.1m 투시 뷰) or 'full' (2.6m 실제 벽)
      showRoomTags: true,
      blueprint: {
        visible: true,
        opacity: 0.5,
        scale: 1.0,
        offsetX: 0,
        offsetZ: 0
      }
    },
    room: {
      floorType: 'wood',
      wallColor: '#f4efe6',
      wallPattern: 'clean'
    },
    lighting: {
      isDay: true,
      shadows: true
    },
    selectedObject: null,
    isDragging: false,
    placedItems: [],
    roomTags: []
  };

  // Three.js Core Objects
  let scene, camera, renderer, controls;
  let floorGroup, wallGroup, fixturesGroup;
  let blueprintPlane, blueprintMaterial;
  let ambientLight, hemiLight, dirLight, nightRoomLight;
  let floorGrid, selectionHelper;
  let raycaster, mouse, dragPlane, dragIntersection, dragOffset;
  let canvasContainer;

  // DOM Elements Cache
  const DOM = {};

  // --------------------------------------------------------------------------
  // 2. Procedural Canvas Textures & Blueprint Drawing Generator
  // --------------------------------------------------------------------------
  const TextureGenerator = {
    /**
     * 내추럴 오크 마루 바닥재 캔버스 텍스처
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

          // Wood grain lines
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
     * 비앙코 카라라 대리석 텍스처
     */
    createMarble() {
      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 1024;
      const ctx = canvas.getContext('2d');

      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const drawVein = (startX, startY, color, width) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        ctx.beginPath();
        let cx = startX;
        let cy = startY;
        ctx.moveTo(cx, cy);
        for (let i = 0; i < 35; i++) {
          cx += (Math.random() - 0.45) * 45;
          cy += Math.random() * 35;
          ctx.lineTo(cx, cy);
        }
        ctx.stroke();
      };

      for (let v = 0; v < 6; v++) {
        drawVein(Math.random() * canvas.width, 0, 'rgba(148, 163, 184, 0.28)', 3);
        drawVein(Math.random() * canvas.width, 0, 'rgba(100, 116, 139, 0.15)', 1.5);
      }

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
     * 모던 세라믹 타일 텍스처
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
          ctx.fillStyle = '#94a3b8';
          ctx.fillRect(x + 3, y + 3, size - 6, size - 6);
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
     * 노출 콘크리트 텍스처
     */
    createConcrete() {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');

      ctx.fillStyle = '#475569';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      for (let i = 0; i < 30000; i++) {
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
     * 벽면 패턴 (린넨, 스트라이프)
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
     * 첨부 아파트 도면(7.35m × 6.9m) 2D 캐드 청사진 그래픽 캔버스 생성
     */
    createApartmentBlueprint() {
      const canvas = document.createElement('canvas');
      canvas.width = 1470; // 7.35m * 200px/m
      canvas.height = 1380; // 6.90m * 200px/m
      const ctx = canvas.getContext('2d');

      // CAD Blueprint Background (Off-white / blueprint grid)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Light background tint per room
      // Balcony (left: 270px)
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, 270, canvas.height);

      // Bedroom (top-mid: 720px * 600px)
      ctx.fillStyle = '#fefce8';
      ctx.fillRect(270, 0, 720, 600);

      // Living Room (bottom-mid: 720px * 780px)
      ctx.fillStyle = '#fffbeb';
      ctx.fillRect(270, 600, 720, 780);

      // Bathroom (top-right: 480px * 320px)
      ctx.fillStyle = '#f0f9ff';
      ctx.fillRect(990, 0, 480, 320);

      // Kitchen & Dining (bottom-right: 480px * 1060px)
      ctx.fillStyle = '#fef3c7';
      ctx.fillRect(990, 320, 480, 1060);

      // Fine architectural grid lines
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
      ctx.lineWidth = 1;
      for (let x = 0; x < canvas.width; x += 50) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += 50) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
      }

      // Outer Thick Walls
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 8;
      ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);

      // Interior Partitions
      ctx.lineWidth = 6;
      // 1. Balcony wall (x = 270)
      ctx.beginPath(); ctx.moveTo(270, 0); ctx.lineTo(270, canvas.height); ctx.stroke();
      // 2. Bed/Living divider (y = 600, from 270 to 990)
      ctx.beginPath(); ctx.moveTo(270, 600); ctx.lineTo(990, 600); ctx.stroke();
      // 3. Hallway/Kitchen divider (x = 990)
      ctx.beginPath(); ctx.moveTo(990, 0); ctx.lineTo(990, canvas.height); ctx.stroke();
      // 4. Bathroom bottom wall (y = 320, from 990 to 1470)
      ctx.beginPath(); ctx.moveTo(990, 320); ctx.lineTo(canvas.width, 320); ctx.stroke();

      // Room Labels & Dimensions Text
      ctx.fillStyle = '#0f172a';
      ctx.textAlign = 'center';

      // Balcony
      ctx.font = 'bold 36px sans-serif';
      ctx.fillText('발 코 니', 135, canvas.height / 2 - 20);
      ctx.font = '22px sans-serif';
      ctx.fillText('1,350 × 6,900', 135, canvas.height / 2 + 20);

      // Bedroom
      ctx.font = 'bold 44px sans-serif';
      ctx.fillText('침 실', 630, 280);
      ctx.font = '24px sans-serif';
      ctx.fillText('3,600 × 3,000', 630, 325);

      // Living Room
      ctx.font = 'bold 46px sans-serif';
      ctx.fillText('거실 겸 침실', 630, 960);
      ctx.font = '24px sans-serif';
      ctx.fillText('3,600 × 3,900', 630, 1010);

      // Bathroom
      ctx.font = 'bold 32px sans-serif';
      ctx.fillText('욕 실', 1230, 150);
      ctx.font = '20px sans-serif';
      ctx.fillText('2,400 × 1,600', 1230, 185);

      // Kitchen & Dining
      ctx.font = 'bold 40px sans-serif';
      ctx.fillText('주방 및 식당', 1230, 750);
      ctx.font = '24px sans-serif';
      ctx.fillText('2,400 × 5,300', 1230, 800);

      // Door swing guides (arcs)
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);

      // Bedroom door arc
      ctx.beginPath();
      ctx.arc(920, 600, 70, Math.PI, 1.5 * Math.PI, false);
      ctx.stroke();

      // Bathroom door arc
      ctx.beginPath();
      ctx.arc(1060, 320, 70, 0.5 * Math.PI, Math.PI, false);
      ctx.stroke();
      ctx.setLineDash([]);

      const texture = new THREE.CanvasTexture(canvas);
      return texture;
    },

    /**
     * TV 스크린 UI 텍스처
     */
    createTVScreen() {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 288;
      const ctx = canvas.getContext('2d');

      const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      grad.addColorStop(0, '#0f172a');
      grad.addColorStop(0.5, '#1e1b4b');
      grad.addColorStop(1, '#311042');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = 'rgba(99, 102, 241, 0.3)';
      ctx.beginPath(); ctx.arc(360, 140, 100, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 24px sans-serif';
      ctx.fillText('Cosmic Odyssey', 24, 210);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
      ctx.font = '12px sans-serif';
      ctx.fillText('▶ 지금 재생하기  •  Ultra High Definition', 24, 235);

      return new THREE.CanvasTexture(canvas);
    }
  };

  // --------------------------------------------------------------------------
  // 3. Furniture Procedural Factory (Apartment-Scaled Realistic Models)
  // --------------------------------------------------------------------------
  const FurnitureFactory = {
    applyShadows(mesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    },

    // 1. 모던 소파 (컴팩트 아파트형 1.75m × 0.75m)
    createSofa(primaryColor = '#475569') {
      const group = new THREE.Group();
      const colorables = [];
      const fabricMat = new THREE.MeshStandardMaterial({ color: primaryColor, roughness: 0.85 });
      colorables.push(fabricMat);
      const woodMat = new THREE.MeshStandardMaterial({ color: '#3d2817', roughness: 0.6 });
      const pillowMat = new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.9 });

      const base = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.18, 0.75), fabricMat);
      base.position.y = 0.18;
      group.add(this.applyShadows(base));

      for (let i = -1; i <= 1; i++) {
        const cushion = new THREE.Mesh(new THREE.BoxGeometry(0.53, 0.14, 0.65), fabricMat);
        cushion.position.set(i * 0.55, 0.32, 0.02);
        group.add(this.applyShadows(cushion));
      }

      const backrest = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.52, 0.16), fabricMat);
      backrest.position.set(0, 0.52, -0.3);
      group.add(this.applyShadows(backrest));

      const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.34, 0.75), fabricMat);
      armL.position.set(-0.88, 0.42, 0);
      const armR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.34, 0.75), fabricMat);
      armR.position.set(0.88, 0.42, 0);
      group.add(this.applyShadows(armL), this.applyShadows(armR));

      const throwP1 = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.08), pillowMat);
      throwP1.position.set(-0.7, 0.45, -0.12);
      throwP1.rotation.y = 0.3;
      const throwP2 = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.08), pillowMat);
      throwP2.position.set(0.7, 0.45, -0.12);
      throwP2.rotation.y = -0.3;
      group.add(this.applyShadows(throwP1), this.applyShadows(throwP2));

      [[-0.8, -0.3], [0.8, -0.3], [-0.8, 0.3], [0.8, 0.3]].forEach(([x, z]) => {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.018, 0.12, 12), woodMat);
        leg.position.set(x, 0.06, z);
        group.add(this.applyShadows(leg));
      });

      group.userData = { name: '3인용 모던 패브릭 소파', category: '거실', colorables, type: 'sofa' };
      return group;
    },

    // 2. 퀸사이즈 침대 & 협탁 (1.65m × 2.05m, 협탁 포함 폭 2.2m)
    createBed(duvetColor = '#3b82f6') {
      const group = new THREE.Group();
      const colorables = [];
      const frameMat = new THREE.MeshStandardMaterial({ color: '#27272a', roughness: 0.7 });
      const mattressMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95 });
      const duvetMat = new THREE.MeshStandardMaterial({ color: duvetColor, roughness: 0.85 });
      colorables.push(duvetMat);
      const pillowMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.9 });
      const woodMat = new THREE.MeshStandardMaterial({ color: '#854d0e', roughness: 0.6 });

      // Bed frame
      const frame = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.2, 2.05), frameMat);
      frame.position.set(0, 0.12, 0);
      group.add(this.applyShadows(frame));

      // Headboard
      const headboard = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.85, 0.12), frameMat);
      headboard.position.set(0, 0.55, -0.98);
      group.add(this.applyShadows(headboard));

      // Mattress
      const mattress = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.26, 1.95), mattressMat);
      mattress.position.set(0, 0.32, 0.02);
      group.add(this.applyShadows(mattress));

      // Duvet
      const duvet = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.12, 1.3), duvetMat);
      duvet.position.set(0, 0.42, 0.32);
      group.add(this.applyShadows(duvet));

      [-0.42, 0.42].forEach((px) => {
        const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.34), pillowMat);
        pillow.position.set(px, 0.5, -0.65);
        pillow.rotation.x = 0.15;
        group.add(this.applyShadows(pillow));
      });

      // Compact bedside nightstands
      [-1.02, 1.02].forEach((sx) => {
        const nightstand = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.36, 0.35), woodMat);
        nightstand.position.set(sx, 0.18, -0.78);
        group.add(this.applyShadows(nightstand));

        const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.025, 12), frameMat);
        lampBase.position.set(sx, 0.37, -0.78);
        const lampShade = new THREE.Mesh(
          new THREE.CylinderGeometry(0.08, 0.12, 0.15, 16),
          new THREE.MeshStandardMaterial({ color: '#fef08a', emissive: '#eab308', emissiveIntensity: 0.35 })
        );
        lampShade.position.set(sx, 0.47, -0.78);
        group.add(this.applyShadows(lampBase), this.applyShadows(lampShade));
      });

      group.userData = { name: '퀸사이즈 침대 & 협탁 세트', category: '침실', colorables, type: 'bed' };
      return group;
    },

    // 3. 55인치 스마트 TV & 슬림 콘솔 (1.5m × 0.34m)
    createSmartTV() {
      const group = new THREE.Group();
      const colorables = [];
      const consoleMat = new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.6 });
      colorables.push(consoleMat);
      const tvBezelMat = new THREE.MeshStandardMaterial({ color: '#09090b', roughness: 0.3 });
      const metalMat = new THREE.MeshStandardMaterial({ color: '#18181b', metalness: 0.8 });

      const cabinet = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.32, 0.34), consoleMat);
      cabinet.position.set(0, 0.25, 0);
      group.add(this.applyShadows(cabinet));

      const screenFrame = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.74, 0.035), tvBezelMat);
      screenFrame.position.set(0, 0.9, 0);
      group.add(this.applyShadows(screenFrame));

      const screenTexture = TextureGenerator.createTVScreen();
      const screenPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.22, 0.71), new THREE.MeshBasicMaterial({ map: screenTexture }));
      screenPlane.position.set(0, 0.9, 0.02);
      group.add(screenPlane);

      const stand = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.02, 0.2), metalMat);
      stand.position.set(0, 0.43, 0);
      group.add(this.applyShadows(stand));

      const soundbar = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.05, 0.07), tvBezelMat);
      soundbar.position.set(0, 0.44, 0.08);
      group.add(this.applyShadows(soundbar));

      group.userData = { name: '55인치 TV & 미디어장', category: '거실', colorables, type: 'tv_unit' };
      return group;
    },

    // 4. 슬림 4도어 냉장고 (0.82m × 0.72m)
    createRefrigerator() {
      const group = new THREE.Group();
      const colorables = [];
      const stainlessMat = new THREE.MeshStandardMaterial({ color: '#cbd5e1', metalness: 0.85, roughness: 0.25 });
      colorables.push(stainlessMat);
      const blackTrimMat = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.4 });
      const handleMat = new THREE.MeshStandardMaterial({ color: '#94a3b8', metalness: 0.9 });

      const body = new THREE.Mesh(new THREE.BoxGeometry(0.82, 1.76, 0.72), stainlessMat);
      body.position.set(0, 0.88, 0);
      group.add(this.applyShadows(body));

      const seam = new THREE.Mesh(new THREE.BoxGeometry(0.01, 1.05, 0.02), blackTrimMat);
      seam.position.set(0, 1.18, 0.37);
      group.add(seam);

      [-0.06, 0.06].forEach((hx) => {
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.65, 12), handleMat);
        handle.position.set(hx, 1.18, 0.4);
        group.add(this.applyShadows(handle));
      });

      const dispenser = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.32, 0.02), blackTrimMat);
      dispenser.position.set(-0.22, 1.28, 0.37);
      group.add(dispenser);

      group.userData = { name: '4도어 메탈 냉장고', category: '주방/가전', colorables, type: 'fridge' };
      return group;
    },

    // 5. 4인용 식탁 세트 (1.2m × 0.72m)
    createDiningTable(woodColor = '#854d0e') {
      const group = new THREE.Group();
      const colorables = [];
      const topMat = new THREE.MeshStandardMaterial({ color: woodColor, roughness: 0.5 });
      colorables.push(topMat);
      const metalMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.4, metalness: 0.7 });
      const seatMat = new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.9 });

      const tabletop = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, 0.72), topMat);
      tabletop.position.set(0, 0.7, 0);
      group.add(this.applyShadows(tabletop));

      [[-0.52, -0.28], [0.52, -0.28], [-0.52, 0.28], [0.52, 0.28]].forEach(([lx, lz]) => {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.016, 0.69, 12), metalMat);
        leg.position.set(lx, 0.345, lz);
        group.add(this.applyShadows(leg));
      });

      [[-0.34, 0.36, Math.PI], [0.34, 0.36, Math.PI], [-0.34, -0.36, 0], [0.34, -0.36, 0]].forEach(([cx, cz, crot]) => {
        const chair = new THREE.Group();
        chair.position.set(cx, 0, cz);
        chair.rotation.y = crot;
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.035, 0.34), seatMat);
        seat.position.y = 0.4;
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.32, 0.03), seatMat);
        back.position.set(0, 0.58, -0.15);
        chair.add(this.applyShadows(seat), this.applyShadows(back));
        group.add(chair);
      });

      group.userData = { name: '4인용 원목 식탁 세트', category: '주방/가전', colorables, type: 'dining_set' };
      return group;
    },

    // 6. 라운지 체어 & 오토만 (0.6m × 0.9m)
    createLoungeChair(accentColor = '#059669') {
      const group = new THREE.Group();
      const colorables = [];
      const cushionMat = new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.75 });
      colorables.push(cushionMat);
      const metalMat = new THREE.MeshStandardMaterial({ color: '#71717a', metalness: 0.8 });

      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.1, 0.55), cushionMat);
      seat.position.set(0, 0.34, 0.04);
      seat.rotation.x = -0.1;
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.52, 0.09), cushionMat);
      back.position.set(0, 0.6, -0.22);
      back.rotation.x = -0.28;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.23, 12), metalMat);
      stem.position.set(0, 0.115, -0.04);
      group.add(this.applyShadows(seat), this.applyShadows(back), this.applyShadows(stem));

      const ottoman = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.08, 0.35), cushionMat);
      ottoman.position.set(0, 0.32, 0.58);
      group.add(this.applyShadows(ottoman));

      group.userData = { name: '라운지 체어 & 오토만', category: '거실', colorables, type: 'lounge_chair' };
      return group;
    },

    // 7. 아치형 플로어 스탠드 (높이 1.55m)
    createFloorLamp(lampColor = '#d97706') {
      const group = new THREE.Group();
      const colorables = [];
      const brassMat = new THREE.MeshStandardMaterial({ color: lampColor, metalness: 0.8 });
      colorables.push(brassMat);
      const shadeMat = new THREE.MeshStandardMaterial({ color: '#fffbeb', roughness: 0.9, emissive: '#f59e0b', emissiveIntensity: 0.4 });

      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.035, 32), brassMat);
      base.position.y = 0.018;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 1.45, 16), brassMat);
      pole.position.set(0, 0.74, 0);
      const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, 0.22, 32, 1, true), shadeMat);
      shade.position.set(0.5, 1.5, 0);
      group.add(this.applyShadows(base), this.applyShadows(pole), shade);

      const lampLight = new THREE.PointLight('#fef08a', 0.85, 5, 2);
      lampLight.position.set(0.5, 1.46, 0);
      lampLight.castShadow = true;
      group.add(lampLight);

      group.userData = { name: '아치형 플로어 스탠드', category: '데코/조명', colorables, lampLight, type: 'floor_lamp' };
      return group;
    },

    // 8. 몬스테라 화분 (Ø 0.24m, 높이 0.8m)
    createPlant() {
      const group = new THREE.Group();
      const colorables = [];
      const potMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 });
      colorables.push(potMat);
      const leafMat = new THREE.MeshStandardMaterial({ color: '#15803d', side: THREE.DoubleSide });

      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.12, 0.32, 24), potMat);
      pot.position.y = 0.24;
      group.add(this.applyShadows(pot));

      [0, 1.2, 2.4, 3.6, 4.8].forEach((ang) => {
        const leaf = new THREE.Mesh(new THREE.CircleGeometry(0.14, 12), leafMat);
        leaf.position.set(Math.cos(ang) * 0.15, 0.5, Math.sin(ang) * 0.15);
        leaf.rotation.x = Math.PI / 2.5;
        leaf.rotation.y = ang;
        group.add(this.applyShadows(leaf));
      });

      group.userData = { name: '보태니컬 몬스테라 화분', category: '데코/조명', colorables, type: 'plant' };
      return group;
    },

    // 9. 미니멀 책장 (0.9m × 0.28m, 높이 1.65m)
    createBookshelf(shelfColor = '#1e293b') {
      const group = new THREE.Group();
      const colorables = [];
      const woodMat = new THREE.MeshStandardMaterial({ color: shelfColor, roughness: 0.6 });
      colorables.push(woodMat);
      const metalMat = new THREE.MeshStandardMaterial({ color: '#09090b', roughness: 0.4, metalness: 0.8 });

      [[-0.42, -0.12], [0.42, -0.12], [-0.42, 0.12], [0.42, 0.12]].forEach(([px, pz]) => {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.035, 1.65, 0.035), metalMat);
        post.position.set(px, 0.825, pz);
        group.add(this.applyShadows(post));
      });

      for (let s = 0; s < 5; s++) {
        const sy = 0.12 + s * 0.36;
        const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.03, 0.28), woodMat);
        shelf.position.set(0, sy, 0);
        group.add(this.applyShadows(shelf));
      }

      group.userData = { name: '미니멀 5단 책장', category: '거실', colorables, type: 'bookshelf' };
      return group;
    },

    // 10. 라운드 소파 테이블 (Ø 0.66m)
    createCoffeeTable(woodColor = '#b08968') {
      const group = new THREE.Group();
      const colorables = [];
      const topMat = new THREE.MeshStandardMaterial({ color: woodColor, roughness: 0.5 });
      colorables.push(topMat);
      const legMat = new THREE.MeshStandardMaterial({ color: '#18181b', metalness: 0.8 });

      const tabletop = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.035, 32), topMat);
      tabletop.position.set(0, 0.34, 0);
      group.add(this.applyShadows(tabletop));

      for (let i = 0; i < 3; i++) {
        const ang = (i * Math.PI * 2) / 3;
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.01, 0.33, 12), legMat);
        leg.position.set(Math.cos(ang) * 0.24, 0.165, Math.sin(ang) * 0.24);
        group.add(this.applyShadows(leg));
      }

      group.userData = { name: '라운드 오크 소파 테이블', category: '거실', colorables, type: 'coffee_table' };
      return group;
    },

    // 11. 키친 아일랜드 (1.5m × 0.7m)
    createKitchenIsland() {
      const group = new THREE.Group();
      const colorables = [];
      const quartzMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.2 });
      const cabinetMat = new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.6 });
      colorables.push(cabinetMat);

      const cabinet = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 0.65), cabinetMat);
      cabinet.position.set(0, 0.4, 0);
      const counter = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.04, 0.75), quartzMat);
      counter.position.set(0, 0.82, 0);
      group.add(this.applyShadows(cabinet), this.applyShadows(counter));

      group.userData = { name: '모던 키친 아일랜드', category: '주방/가전', colorables, type: 'kitchen_island' };
      return group;
    }
  };

  const CATALOG_ITEMS = [
    { id: 'sofa', name: '3인용 모던 소파', category: 'living', dims: '1.75m × 0.75m', icon: '🛋️', create: () => FurnitureFactory.createSofa() },
    { id: 'lounge_chair', name: '라운지 체어 & 오토만', category: 'living', dims: '0.6m × 0.9m', icon: '🪑', create: () => FurnitureFactory.createLoungeChair() },
    { id: 'coffee_table', name: '오크 라운드 소파 테이블', category: 'living', dims: 'Ø 0.66m', icon: '☕', create: () => FurnitureFactory.createCoffeeTable() },
    { id: 'tv_unit', name: '55인치 TV & 미디어장', category: 'living', dims: '1.5m × 0.34m', icon: '📺', create: () => FurnitureFactory.createSmartTV() },
    { id: 'bookshelf', name: '미니멀 5단 책장', category: 'living', dims: '0.9m × 0.28m', icon: '📚', create: () => FurnitureFactory.createBookshelf() },
    { id: 'bed', name: '퀸사이즈 침대 & 협탁', category: 'bedroom', dims: '2.2m × 2.05m', icon: '🛏️', create: () => FurnitureFactory.createBed() },
    { id: 'dining_set', name: '4인용 원목 식탁 세트', category: 'kitchen', dims: '1.2m × 0.85m', icon: '🍽️', create: () => FurnitureFactory.createDiningTable() },
    { id: 'kitchen_island', name: '모던 키친 아일랜드', category: 'kitchen', dims: '1.55m × 0.75m', icon: '🍳', create: () => FurnitureFactory.createKitchenIsland() },
    { id: 'fridge', name: '4도어 메탈 냉장고', category: 'kitchen', dims: '0.82m × 0.72m', icon: '🧊', create: () => FurnitureFactory.createRefrigerator() },
    { id: 'floor_lamp', name: '아치형 플로어 스탠드', category: 'decor', dims: '0.5m × 1.55m', icon: '💡', create: () => FurnitureFactory.createFloorLamp() },
    { id: 'plant', name: '보태니컬 몬스테라 화분', category: 'decor', dims: '0.4m × 0.8m', icon: '🪴', create: () => FurnitureFactory.createPlant() }
  ];

  // --------------------------------------------------------------------------
  // 4. Architectural Multi-Room Structure Generator (Attached Drawing 100%)
  // --------------------------------------------------------------------------
  const FloorplanArchitect = {
    /**
     * 첨부 아파트 도면(7.35m × 6.9m) 3D 구조물 생성
     */
    buildApartment(wallHeight) {
      const group = new THREE.Group();
      group.name = 'structure_apartment';

      const wallMat = new THREE.MeshStandardMaterial({
        color: state.room.wallColor,
        roughness: 0.9,
        metalness: 0.0
      });

      const trimMat = new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.6 });

      // Wall helper function
      const addWallBox = (x, z, w, d, h = wallHeight) => {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
        wall.position.set(x, h / 2, z);
        wall.castShadow = true;
        wall.receiveShadow = true;
        group.add(wall);
        return wall;
      };

      // ----------------------------------------------------------------------
      // [1] Multi-Zone Floors (독립 룸 바닥 메시)
      // ----------------------------------------------------------------------
      const floorMatWood = new THREE.MeshStandardMaterial({ map: TextureGenerator.createWood(), roughness: 0.45 });
      const floorMatTile = new THREE.MeshStandardMaterial({ map: TextureGenerator.createTile(), roughness: 0.35 });
      const floorMatMarble = new THREE.MeshStandardMaterial({ map: TextureGenerator.createMarble(), roughness: 0.18 });

      // Balcony Floor (1.35m × 6.9m, X: -3.00, Z: 0)
      const fBalcony = new THREE.Mesh(new THREE.PlaneGeometry(1.35, 6.90), floorMatTile);
      fBalcony.rotation.x = -Math.PI / 2;
      fBalcony.position.set(-3.00, 0, 0);
      fBalcony.receiveShadow = true;
      group.add(fBalcony);

      // Bedroom Floor (3.60m × 3.00m, X: -0.525, Z: -1.95)
      const fBedroom = new THREE.Mesh(new THREE.PlaneGeometry(3.60, 3.00), floorMatWood);
      fBedroom.rotation.x = -Math.PI / 2;
      fBedroom.position.set(-0.525, 0, -1.95);
      fBedroom.receiveShadow = true;
      group.add(fBedroom);

      // Living Room Floor (3.60m × 3.90m, X: -0.525, Z: +1.50)
      const fLiving = new THREE.Mesh(new THREE.PlaneGeometry(3.60, 3.90), floorMatWood);
      fLiving.rotation.x = -Math.PI / 2;
      fLiving.position.set(-0.525, 0, 1.50);
      fLiving.receiveShadow = true;
      group.add(fLiving);

      // Bathroom Floor (2.40m × 1.60m, X: +2.475, Z: -2.65)
      const fBath = new THREE.Mesh(new THREE.PlaneGeometry(2.40, 1.60), floorMatMarble);
      fBath.rotation.x = -Math.PI / 2;
      fBath.position.set(2.475, 0, -2.65);
      fBath.receiveShadow = true;
      group.add(fBath);

      // Kitchen & Dining Floor (2.40m × 5.30m, X: +2.475, Z: +0.80)
      const fKitchen = new THREE.Mesh(new THREE.PlaneGeometry(2.40, 5.30), floorMatWood);
      fKitchen.rotation.x = -Math.PI / 2;
      fKitchen.position.set(2.475, 0, 0.80);
      fKitchen.receiveShadow = true;
      group.add(fKitchen);

      // ----------------------------------------------------------------------
      // [2] Outer Perimeter Walls (외벽 및 개구부)
      // ----------------------------------------------------------------------
      const wallThick = 0.16;

      // Top Wall (Z = -3.45, Width: 7.35m)
      addWallBox(0, -3.45, 7.35 + wallThick, wallThick);

      // Bottom Wall (Z = +3.45, Width: 7.35m)
      addWallBox(0, +3.45, 7.35 + wallThick, wallThick);

      // Outer Left Wall (Balcony exterior, X = -3.675, with bay window bump-out)
      addWallBox(-3.675, -2.0, wallThick, 2.9);
      addWallBox(-3.675, 2.2, wallThick, 2.5);
      // Curved Bay Window on balcony:
      const bayWindow = new THREE.Mesh(
        new THREE.CylinderGeometry(0.7, 0.7, wallHeight, 16, 1, false, Math.PI / 2, Math.PI),
        wallMat
      );
      bayWindow.position.set(-3.675, wallHeight / 2, 0.4);
      group.add(bayWindow);

      // Outer Right Wall (X = +3.675, with Entry Door cutout at Z = 0)
      addWallBox(3.675, -2.3, wallThick, 2.3);
      addWallBox(3.675, 2.0, wallThick, 2.9);
      // Entry Door (현관문 표시)
      const entryDoor = new THREE.Mesh(new THREE.BoxGeometry(0.04, wallHeight * 0.85, 0.9), trimMat);
      entryDoor.position.set(3.675, (wallHeight * 0.85) / 2, 0.0);
      group.add(entryDoor);

      // ----------------------------------------------------------------------
      // [3] Interior Partition Walls with Real Openings (내벽 & 도어)
      // ----------------------------------------------------------------------
      // A. Balcony Divider Wall (X = -2.325, length 6.9m)
      // Solid segment top
      addWallBox(-2.325, -3.0, wallThick, 0.9);
      // Bedroom window sill / frame (lower opening)
      addWallBox(-2.325, -1.95, wallThick, 1.2, 0.85); // window sill
      // Solid segment between bed & living
      addWallBox(-2.325, -0.9, wallThick, 0.9);
      // Living room large balcony sliding glass frame (open)
      addWallBox(-2.325, 3.1, wallThick, 0.7);

      // B. Bedroom & Living Dividing Wall (Z = -0.45, from X = -2.325 to +1.275)
      // Solid wall left: width 2.6m
      addWallBox(-1.025, -0.45, 2.6, wallThick);
      // Doorway opening to corridor (X = +0.275 to +1.275) with door model:
      const bedDoor = new THREE.Mesh(new THREE.BoxGeometry(0.85, wallHeight * 0.85, 0.04), trimMat);
      bedDoor.position.set(0.75, (wallHeight * 0.85) / 2, -0.45);
      bedDoor.rotation.y = -0.5; // open swing angle
      group.add(bedDoor);

      // C. Corridor & Kitchen Dividing Wall (X = +1.275)
      // Bathroom front wall (Z = -3.45 to -1.85)
      addWallBox(1.275, -2.65, wallThick, 1.6);
      // Open doorway between corridor and kitchen/dining at Z = -1.85 to -0.45
      // Lower partition bar between living and kitchen:
      addWallBox(1.275, 1.8, wallThick, 2.2);

      // D. Bathroom Dividing Wall (Z = -1.85, from X = +1.275 to +3.675)
      addWallBox(2.875, -1.85, 1.6, wallThick);
      // Bathroom door opening
      const bathDoor = new THREE.Mesh(new THREE.BoxGeometry(0.75, wallHeight * 0.85, 0.04), trimMat);
      bathDoor.position.set(1.7, (wallHeight * 0.85) / 2, -1.85);
      bathDoor.rotation.y = 0.4;
      group.add(bathDoor);

      // ----------------------------------------------------------------------
      // [4] Built-in Fixtures (욕실 위생도기 & 주방 싱크대)
      // ----------------------------------------------------------------------
      // Bathroom Toilet (양변기)
      const toiletMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.2 });
      const toiletTank = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.22), toiletMat);
      toiletTank.position.set(3.2, 0.45, -3.2);
      const toiletBowl = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.14, 0.38, 16), toiletMat);
      toiletBowl.position.set(3.2, 0.19, -2.95);
      group.add(toiletTank, toiletBowl);

      // Bathroom Sink (세면대)
      const sink = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.2, 0.4), toiletMat);
      sink.position.set(2.4, 0.65, -3.2);
      const sinkStem = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.55, 12), toiletMat);
      sinkStem.position.set(2.4, 0.275, -3.2);
      group.add(sink, sinkStem);

      // Kitchen Sink Counter (싱크대 & 쿡탑 빌트인, bottom-right)
      const kitchenCounterMat = new THREE.MeshStandardMaterial({ color: '#475569', roughness: 0.4 });
      const kCounter = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.85, 0.65), kitchenCounterMat);
      kCounter.position.set(2.45, 0.425, 3.05);
      group.add(kCounter);

      return group;
    },

    /**
     * 오픈 단일 룸 (기존 10m × 8m)
     */
    buildOpenStudio(wallHeight) {
      const group = new THREE.Group();
      group.name = 'structure_studio';

      const floorMat = new THREE.MeshStandardMaterial({ map: TextureGenerator.createWood(), roughness: 0.45 });
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 8), floorMat);
      floor.rotation.x = -Math.PI / 2;
      floor.receiveShadow = true;
      group.add(floor);

      const wallMat = new THREE.MeshStandardMaterial({ color: state.room.wallColor, roughness: 0.9 });
      const wBack = new THREE.Mesh(new THREE.PlaneGeometry(10, wallHeight), wallMat);
      wBack.position.set(0, wallHeight / 2, -4);
      const wLeft = new THREE.Mesh(new THREE.PlaneGeometry(8, wallHeight), wallMat);
      wLeft.position.set(-5, wallHeight / 2, 0);
      wLeft.rotation.y = Math.PI / 2;
      const wRight = new THREE.Mesh(new THREE.PlaneGeometry(8, wallHeight), wallMat);
      wRight.position.set(5, wallHeight / 2, 0);
      wRight.rotation.y = -Math.PI / 2;

      group.add(wBack, wLeft, wRight);
      return group;
    }
  };

  // --------------------------------------------------------------------------
  // 5. 3D Room Floating Tags & Info Overlays
  // --------------------------------------------------------------------------
  const ROOM_ZONES = {
    balcony: { name: '발코니', dims: '1.35m × 6.9m', center: { x: -3.00, y: 0.8, z: 0.0 }, cam: { pos: { x: -3.0, y: 5.5, z: 3.5 }, look: { x: -3.0, y: 0, z: 0 } } },
    bedroom: { name: '침실', dims: '3.6m × 3.0m', center: { x: -0.525, y: 0.8, z: -1.95 }, cam: { pos: { x: -0.5, y: 6.0, z: 1.5 }, look: { x: -0.5, y: 0, z: -1.95 } } },
    living: { name: '거실 겸 침실', dims: '3.6m × 3.9m', center: { x: -0.525, y: 0.8, z: 1.50 }, cam: { pos: { x: -0.5, y: 6.5, z: 5.5 }, look: { x: -0.5, y: 0, z: 1.5 } } },
    kitchen: { name: '주방 및 식당', dims: '2.4m × 5.3m', center: { x: 2.475, y: 0.8, z: 0.80 }, cam: { pos: { x: 2.5, y: 6.5, z: 4.8 }, look: { x: 2.5, y: 0, z: 0.8 } } },
    bathroom: { name: '욕실', dims: '2.4m × 1.6m', center: { x: 2.475, y: 0.8, z: -2.65 }, cam: { pos: { x: 2.5, y: 4.5, z: -0.8 }, look: { x: 2.5, y: 0, z: -2.65 } } },
    all: { name: '전체 조망', dims: '7.35m × 6.9m', center: { x: 0, y: 0, z: 0 }, cam: { pos: { x: 8.5, y: 9.5, z: 8.5 }, look: { x: 0, y: 0.5, z: 0 } } }
  };

  function createRoomTagsUI() {
    // Clear old tags
    document.querySelectorAll('.room-3d-tag').forEach((t) => t.remove());
    state.roomTags = [];

    if (!state.floorplan.showRoomTags || state.floorplan.preset !== 'apartment') return;

    Object.keys(ROOM_ZONES).forEach((key) => {
      if (key === 'all') return;
      const zone = ROOM_ZONES[key];
      const tagEl = document.createElement('div');
      tagEl.className = 'room-3d-tag';
      tagEl.innerHTML = `<span>${zone.name}</span><span class="dim-sub">${zone.dims}</span>`;
      canvasContainer.appendChild(tagEl);

      state.roomTags.push({
        element: tagEl,
        worldPos: new THREE.Vector3(zone.center.x, zone.center.y, zone.center.z)
      });
    });
  }

  function updateRoomTagsProjection() {
    if (!state.floorplan.showRoomTags || state.roomTags.length === 0) return;

    const widthHalf = canvasContainer.clientWidth / 2;
    const heightHalf = canvasContainer.clientHeight / 2;
    const tempV = new THREE.Vector3();

    state.roomTags.forEach((tag) => {
      tempV.copy(tag.worldPos);
      tempV.project(camera);

      // Check if behind camera
      if (tempV.z > 1.0) {
        tag.element.style.display = 'none';
        return;
      }

      tag.element.style.display = 'flex';
      const screenX = tempV.x * widthHalf + widthHalf;
      const screenY = -(tempV.y * heightHalf) + heightHalf;
      tag.element.style.left = `${screenX}px`;
      tag.element.style.top = `${screenY}px`;
    });
  }

  // --------------------------------------------------------------------------
  // 6. Blueprint Ground Projection Setup
  // --------------------------------------------------------------------------
  function setupBlueprintOverlay() {
    const defaultBlueprintTexture = TextureGenerator.createApartmentBlueprint();
    blueprintMaterial = new THREE.MeshBasicMaterial({
      map: defaultBlueprintTexture,
      transparent: true,
      opacity: state.floorplan.blueprint.opacity,
      depthWrite: false
    });

    // 7.35m × 6.90m Plane placed just above ground (y = 0.002)
    blueprintPlane = new THREE.Mesh(new THREE.PlaneGeometry(7.35, 6.90), blueprintMaterial);
    blueprintPlane.rotation.x = -Math.PI / 2;
    blueprintPlane.position.set(0, 0.002, 0);
    blueprintPlane.visible = state.floorplan.blueprint.visible;
    scene.add(blueprintPlane);
  }

  function updateBlueprintVisibility() {
    if (blueprintPlane) {
      blueprintPlane.visible = state.floorplan.blueprint.visible && state.floorplan.preset === 'apartment';
    }
  }

  // --------------------------------------------------------------------------
  // 7. Core Three.js Initialization
  // --------------------------------------------------------------------------
  function initThree() {
    canvasContainer = document.getElementById('canvas-container');

    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color('#090d16');
    scene.fog = new THREE.FogExp2('#090d16', 0.015);

    // Camera
    camera = new THREE.PerspectiveCamera(40, canvasContainer.clientWidth / canvasContainer.clientHeight, 0.1, 1000);
    camera.position.set(8.5, 9.5, 8.5);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    canvasContainer.appendChild(renderer.domElement);

    // OrbitControls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 0.5, 0);
    controls.maxPolarAngle = Math.PI / 2 - 0.03;
    controls.minDistance = 2;
    controls.maxDistance = 30;

    // Lighting
    setupLighting();

    // Floor Grid
    floorGrid = new THREE.GridHelper(12, 24, 0x6366f1, 0x1e293b);
    floorGrid.position.y = 0.004;
    scene.add(floorGrid);

    // Blueprint Overlay
    setupBlueprintOverlay();

    // Active Structure Group
    rebuildActiveStructure();

    // Interaction Objects
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();
    dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    dragIntersection = new THREE.Vector3();
    dragOffset = new THREE.Vector3();

    // Selection Box Helper
    selectionHelper = new THREE.BoxHelper(new THREE.Mesh(), 0x6366f1);
    selectionHelper.visible = false;
    selectionHelper.material.depthTest = false;
    scene.add(selectionHelper);

    // Events
    setupInteractionEvents();
    window.addEventListener('resize', onWindowResize);

    // Render loop
    animate();
  }

  function setupLighting() {
    ambientLight = new THREE.AmbientLight('#ffffff', 0.6);
    scene.add(ambientLight);

    hemiLight = new THREE.HemisphereLight('#f1f5f9', '#334155', 0.45);
    hemiLight.position.set(0, 15, 0);
    scene.add(hemiLight);

    dirLight = new THREE.DirectionalLight('#fff7ed', 1.05);
    dirLight.position.set(10, 16, 8);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 35;
    dirLight.shadow.bias = -0.0003;
    const d = 7;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    scene.add(dirLight);

    nightRoomLight = new THREE.PointLight('#fef08a', 0, 14, 2);
    nightRoomLight.position.set(0, 2.6, 0);
    scene.add(nightRoomLight);
  }

  function rebuildActiveStructure() {
    // Remove previous structure
    const old = scene.getObjectByName('structure_apartment') || scene.getObjectByName('structure_studio');
    if (old) scene.remove(old);

    const wallH = state.floorplan.wallHeightMode === 'low' ? 1.1 : 2.6;

    if (state.floorplan.preset === 'apartment') {
      const apartmentGroup = FloorplanArchitect.buildApartment(wallH);
      scene.add(apartmentGroup);
    } else {
      const studioGroup = FloorplanArchitect.buildOpenStudio(wallH);
      scene.add(studioGroup);
    }

    updateBlueprintVisibility();
    createRoomTagsUI();
  }

  // --------------------------------------------------------------------------
  // 8. Raycasting, Drag-and-Drop & Transform
  // --------------------------------------------------------------------------
  function setupInteractionEvents() {
    const canvas = renderer.domElement;

    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      updateMouseCoords(e);
      raycaster.setFromCamera(mouse, camera);

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
          state.isDragging = true;
          controls.enabled = false;
          if (raycaster.ray.intersectPlane(dragPlane, dragIntersection)) {
            dragOffset.copy(topFurniture.position).sub(dragIntersection);
          }
          DOM.dragIndicator.classList.add('active');
          canvas.style.cursor = 'grabbing';
          return;
        }
      }

      if (!state.isDragging) deselectFurniture();
    });

    window.addEventListener('pointermove', (e) => {
      updateMouseCoords(e);

      if (state.isDragging && state.selectedObject) {
        raycaster.setFromCamera(mouse, camera);
        if (raycaster.ray.intersectPlane(dragPlane, dragIntersection)) {
          let targetX = dragIntersection.x + dragOffset.x;
          let targetZ = dragIntersection.z + dragOffset.z;

          if (e.shiftKey) {
            targetX = Math.round(targetX / 0.25) * 0.25;
            targetZ = Math.round(targetZ / 0.25) * 0.25;
          }

          // Boundary limit for apartment (7.35m × 6.9m)
          const limitX = state.floorplan.preset === 'apartment' ? 3.3 : 4.4;
          const limitZ = state.floorplan.preset === 'apartment' ? 3.1 : 3.4;
          targetX = Math.max(-limitX, Math.min(limitX, targetX));
          targetZ = Math.max(-limitZ, Math.min(limitZ, targetZ));

          state.selectedObject.position.x = targetX;
          state.selectedObject.position.z = targetZ;

          selectionHelper.update();
          syncInspectorWithObject(state.selectedObject);
        }
      } else {
        raycaster.setFromCamera(mouse, camera);
        const interactiveMeshes = [];
        state.placedItems.forEach((grp) => {
          grp.traverse((c) => { if (c.isMesh) interactiveMeshes.push(c); });
        });
        const hits = raycaster.intersectObjects(interactiveMeshes, false);
        canvas.style.cursor = hits.length > 0 ? 'grab' : 'default';
      }
    });

    window.addEventListener('pointerup', () => {
      if (state.isDragging) {
        state.isDragging = false;
        controls.enabled = true;
        DOM.dragIndicator.classList.remove('active');
        canvas.style.cursor = 'grab';
      }
    });

    window.addEventListener('keydown', (e) => {
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

  function selectFurniture(furnitureGroup) {
    state.selectedObject = furnitureGroup;
    selectionHelper.setFromObject(furnitureGroup);
    selectionHelper.visible = true;
    DOM.inspectorPanel.classList.add('active');
    syncInspectorWithObject(furnitureGroup);
    updateLayersListUI();
  }

  function deselectFurniture() {
    state.selectedObject = null;
    selectionHelper.visible = false;
    DOM.inspectorPanel.classList.remove('active');
    updateLayersListUI();
  }

  function syncInspectorWithObject(obj) {
    if (!obj) return;
    DOM.inspName.textContent = obj.userData.name || '인테리어 가구';
    DOM.inspCategory.textContent = obj.userData.category || '가구';

    DOM.sliderPosX.value = obj.position.x;
    DOM.valPosX.textContent = `${obj.position.x.toFixed(2)}m`;
    DOM.sliderPosZ.value = obj.position.z;
    DOM.valPosZ.textContent = `${obj.position.z.toFixed(2)}m`;
    DOM.sliderPosY.value = obj.position.y;
    DOM.valPosY.textContent = `${obj.position.y.toFixed(2)}m`;

    const deg = Math.round(THREE.MathUtils.radToDeg(obj.rotation.y)) % 360;
    const normalizedDeg = deg < 0 ? deg + 360 : deg;
    DOM.sliderRotY.value = normalizedDeg;
    DOM.valRotY.textContent = `${normalizedDeg}°`;

    DOM.sliderScale.value = obj.scale.x;
    DOM.valScale.textContent = `${obj.scale.x.toFixed(2)}x`;
  }

  function placeFurnitureInRoom(furnitureGroup, position = null) {
    if (position) {
      furnitureGroup.position.copy(position);
    } else {
      // Default: living room area center
      furnitureGroup.position.set(-0.525, 0, 1.5);
    }

    // Apply global furniture scale (80% by default for apartment scale)
    const s = state.furnitureScale || 0.8;
    furnitureGroup.scale.set(s, s, s);

    scene.add(furnitureGroup);
    state.placedItems.push(furnitureGroup);

    updatePlacedStats();
    updateLayersListUI();
    selectFurniture(furnitureGroup);
    showToast(`'${furnitureGroup.userData.name}'이(가) 배치되었습니다.`);
  }

  function rotateSelectedObject(deltaRad) {
    if (!state.selectedObject) return;
    state.selectedObject.rotation.y += deltaRad;
    selectionHelper.update();
    syncInspectorWithObject(state.selectedObject);
  }

  function duplicateSelectedFurniture() {
    if (!state.selectedObject) return;
    const src = state.selectedObject;
    const catItem = CATALOG_ITEMS.find((c) => c.id === src.userData.type);
    if (catItem) {
      const clone = catItem.create();
      clone.rotation.y = src.rotation.y;
      clone.scale.copy(src.scale);
      if (src.userData.customColor && clone.userData.colorables) {
        clone.userData.customColor = src.userData.customColor;
        clone.userData.colorables.forEach((m) => m.color.set(src.userData.customColor));
      }
      placeFurnitureInRoom(clone, src.position.clone().add(new THREE.Vector3(0.3, 0, 0.3)));
    }
  }

  function deleteSelectedFurniture() {
    if (!state.selectedObject) return;
    const item = state.selectedObject;
    scene.remove(item);
    state.placedItems = state.placedItems.filter((i) => i !== item);
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

  // --------------------------------------------------------------------------
  // 9. Camera Controls & Room Focus
  // --------------------------------------------------------------------------
  function focusRoom(roomKey) {
    const zone = ROOM_ZONES[roomKey];
    if (!zone) return;

    document.querySelectorAll('.room-pills .room-pill').forEach((p) => p.classList.remove('active'));
    const btn = document.querySelector(`.room-pill[data-room="${roomKey}"]`);
    if (btn) btn.classList.add('active');

    camera.position.set(zone.cam.pos.x, zone.cam.pos.y, zone.cam.pos.z);
    controls.target.set(zone.cam.look.x, zone.cam.look.y, zone.cam.look.z);
    controls.update();

    showToast(`'${zone.name}' 시점으로 이동했습니다.`);
  }

  function setCameraView(mode) {
    document.querySelectorAll('.view-presets .tool-btn').forEach((b) => b.classList.remove('active'));

    if (mode === 'iso') {
      DOM.btnViewIso.classList.add('active');
      camera.position.set(8.5, 9.5, 8.5);
      controls.target.set(0, 0.5, 0);
    } else if (mode === 'top') {
      DOM.btnViewTop.classList.add('active');
      camera.position.set(0.001, 13.5, 0);
      controls.target.set(0, 0, 0);
    } else if (mode === 'eye') {
      DOM.btnViewEye.classList.add('active');
      camera.position.set(-0.5, 1.4, 3.2); // inside living room looking across
      controls.target.set(-0.5, 1.2, -1.5);
    }
    controls.update();
  }

  // --------------------------------------------------------------------------
  // 10. UI Bindings & Blueprint File Upload
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

    // Floorplan Tab Elements (NEW)
    DOM.presetSelect = document.getElementById('floorplan-preset-select');
    DOM.roomPills = document.querySelectorAll('.room-pill');
    DOM.btnWallLow = document.getElementById('btn-wall-low');
    DOM.btnWallFull = document.getElementById('btn-wall-full');
    DOM.chkRoomTags = document.getElementById('chk-show-room-tags');
    DOM.blueprintUploadTrigger = document.getElementById('blueprint-upload-trigger');
    DOM.blueprintFileInput = document.getElementById('blueprint-file-input');
    DOM.blueprintFilename = document.getElementById('blueprint-filename-text');
    DOM.sliderBlueprintOpacity = document.getElementById('slider-blueprint-opacity');
    DOM.valBlueprintOpacity = document.getElementById('val-blueprint-opacity');
    DOM.sliderBlueprintScale = document.getElementById('slider-blueprint-scale');
    DOM.valBlueprintScale = document.getElementById('val-blueprint-scale');
    DOM.chkToggleBlueprint = document.getElementById('chk-toggle-blueprint');

    // Furniture Scale Controller (NEW)
    DOM.valGlobalScale = document.getElementById('val-global-furniture-scale');
    DOM.globalScaleBtns = document.querySelectorAll('#global-furniture-scale-group .segment-btn');

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
    // 0. Global Furniture Scale Selector
    if (DOM.globalScaleBtns) {
      DOM.globalScaleBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
          DOM.globalScaleBtns.forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          const s = parseFloat(btn.dataset.scale);
          state.furnitureScale = s;
          const pct = Math.round(s * 100);
          if (DOM.valGlobalScale) {
            DOM.valGlobalScale.textContent = `${pct}% (${s === 0.8 ? '아파트 맞춤' : s === 1.0 ? '표준' : '대형'})`;
          }
          // Real-time re-scale all placed furniture in room
          state.placedItems.forEach((item) => {
            item.scale.set(s, s, s);
          });
          if (selectionHelper && selectionHelper.visible) selectionHelper.update();
          if (state.selectedObject) syncInspectorWithObject(state.selectedObject);
          showToast(`가구 규격이 ${pct}% 비율로 일괄 조정되었습니다.`);
        });
      });
    }

    // 1. Sidebar Tabs
    DOM.tabBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        DOM.tabBtns.forEach((b) => b.classList.remove('active'));
        DOM.tabContents.forEach((c) => c.classList.remove('active'));
        btn.classList.add('active');
        const target = document.getElementById(`tab-${btn.dataset.tab}`);
        if (target) target.classList.add('active');
      });
    });

    // 2. Floorplan Presets
    DOM.presetSelect.addEventListener('change', (e) => {
      state.floorplan.preset = e.target.value;
      rebuildActiveStructure();
      showToast(`'${e.target.options[e.target.selectedIndex].text}' 구조가 적용되었습니다.`);
    });

    // 3. Room Focus Buttons
    DOM.roomPills.forEach((pill) => {
      pill.addEventListener('click', () => {
        focusRoom(pill.dataset.room);
      });
    });

    // 4. Wall Height Mode (1.1m vs 2.6m)
    DOM.btnWallLow.addEventListener('click', () => {
      DOM.btnWallLow.classList.add('active');
      DOM.btnWallFull.classList.remove('active');
      state.floorplan.wallHeightMode = 'low';
      rebuildActiveStructure();
      showToast('1.1m 투시 뷰 (모델하우스 모드)로 전환되었습니다.');
    });

    DOM.btnWallFull.addEventListener('click', () => {
      DOM.btnWallFull.classList.add('active');
      DOM.btnWallLow.classList.remove('active');
      state.floorplan.wallHeightMode = 'full';
      rebuildActiveStructure();
      showToast('2.6m 실제 전체 벽체 뷰로 전환되었습니다.');
    });

    DOM.chkRoomTags.addEventListener('change', (e) => {
      state.floorplan.showRoomTags = e.target.checked;
      createRoomTagsUI();
    });

    // 5. Blueprint Image Upload (FileReader)
    DOM.blueprintUploadTrigger.addEventListener('click', () => {
      DOM.blueprintFileInput.click();
    });

    DOM.blueprintFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const uploadedTex = new THREE.CanvasTexture(img);
          if (blueprintMaterial) {
            blueprintMaterial.map = uploadedTex;
            blueprintMaterial.needsUpdate = true;
          }
          DOM.blueprintFilename.textContent = `업로드됨: ${file.name}`;
          showToast('평면도 이미지가 3D 바닥에 성공적으로 투영되었습니다!');
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    });

    // 6. Blueprint Controls (Opacity, Scale, Toggle)
    DOM.sliderBlueprintOpacity.addEventListener('input', (e) => {
      const op = parseFloat(e.target.value);
      state.floorplan.blueprint.opacity = op;
      if (blueprintMaterial) blueprintMaterial.opacity = op;
      DOM.valBlueprintOpacity.textContent = `${Math.round(op * 100)}%`;
    });

    DOM.sliderBlueprintScale.addEventListener('input', (e) => {
      const sc = parseFloat(e.target.value);
      state.floorplan.blueprint.scale = sc;
      if (blueprintPlane) blueprintPlane.scale.set(sc, sc, 1);
      DOM.valBlueprintScale.textContent = `${sc.toFixed(2)}x`;
    });

    DOM.chkToggleBlueprint.addEventListener('change', (e) => {
      state.floorplan.blueprint.visible = e.target.checked;
      updateBlueprintVisibility();
    });

    // 7. Catalog Filters & Placement
    DOM.filterChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        DOM.filterChips.forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        renderCatalog(chip.dataset.category);
      });
    });

    // 8. Camera Views & Lighting
    DOM.btnViewIso.addEventListener('click', () => setCameraView('iso'));
    DOM.btnViewTop.addEventListener('click', () => setCameraView('top'));
    DOM.btnViewEye.addEventListener('click', () => setCameraView('eye'));
    DOM.btnToggleLight.addEventListener('click', toggleLightingMode);
    DOM.btnToggleGrid.addEventListener('click', () => {
      floorGrid.visible = !floorGrid.visible;
      DOM.btnToggleGrid.classList.toggle('active', floorGrid.visible);
    });
    DOM.btnResetCam.addEventListener('click', () => {
      setCameraView('iso');
      showToast('카메라 뷰가 초기화되었습니다.');
    });

    // 9. Inspector Sliders
    DOM.btnCloseInspector.addEventListener('click', deselectFurniture);
    DOM.sliderPosX.addEventListener('input', (e) => {
      if (!state.selectedObject) return;
      const v = parseFloat(e.target.value);
      state.selectedObject.position.x = v;
      DOM.valPosX.textContent = `${v.toFixed(2)}m`;
      selectionHelper.update();
    });
    DOM.sliderPosZ.addEventListener('input', (e) => {
      if (!state.selectedObject) return;
      const v = parseFloat(e.target.value);
      state.selectedObject.position.z = v;
      DOM.valPosZ.textContent = `${v.toFixed(2)}m`;
      selectionHelper.update();
    });
    DOM.sliderPosY.addEventListener('input', (e) => {
      if (!state.selectedObject) return;
      const v = parseFloat(e.target.value);
      state.selectedObject.position.y = v;
      DOM.valPosY.textContent = `${v.toFixed(2)}m`;
      selectionHelper.update();
    });
    DOM.sliderRotY.addEventListener('input', (e) => {
      if (!state.selectedObject) return;
      const deg = parseInt(e.target.value, 10);
      state.selectedObject.rotation.y = THREE.MathUtils.degToRad(deg);
      DOM.valRotY.textContent = `${deg}°`;
      selectionHelper.update();
    });
    DOM.sliderScale.addEventListener('input', (e) => {
      if (!state.selectedObject) return;
      const s = parseFloat(e.target.value);
      state.selectedObject.scale.set(s, s, s);
      DOM.valScale.textContent = `${s.toFixed(2)}x`;
      selectionHelper.update();
    });

    DOM.inspBtnRotateLeft.addEventListener('click', () => rotateSelectedObject(-Math.PI / 4));
    DOM.inspBtnRotateRight.addEventListener('click', () => rotateSelectedObject(Math.PI / 4));
    DOM.inspBtnCenter.addEventListener('click', () => {
      if (!state.selectedObject) return;
      state.selectedObject.position.x = -0.5;
      state.selectedObject.position.z = 1.5;
      selectionHelper.update();
      syncInspectorWithObject(state.selectedObject);
    });
    DOM.inspBtnDuplicate.addEventListener('click', duplicateSelectedFurniture);
    DOM.inspBtnDelete.addEventListener('click', deleteSelectedFurniture);

    DOM.colorDots.forEach((dot) => {
      dot.addEventListener('click', () => {
        if (!state.selectedObject) return;
        const color = dot.dataset.color;
        state.selectedObject.userData.customColor = color;
        if (state.selectedObject.userData.colorables) {
          state.selectedObject.userData.colorables.forEach((mat) => mat.color.set(color));
        }
        DOM.colorDots.forEach((d) => d.classList.remove('active'));
        dot.classList.add('active');
        showToast('가구의 컬러가 변경되었습니다.');
      });
    });

    DOM.btnSelectNone.addEventListener('click', deselectFurniture);
    DOM.btnClearScene.addEventListener('click', () => {
      if (confirm('모든 가구를 방에서 제거하시겠습니까?')) {
        state.placedItems.forEach((it) => scene.remove(it));
        state.placedItems = [];
        deselectFurniture();
        updatePlacedStats();
        updateLayersListUI();
        showToast('방이 초기화되었습니다.');
      }
    });
  }

  function renderCatalog(category = 'all') {
    DOM.catalogGrid.innerHTML = '';
    const filtered = category === 'all' ? CATALOG_ITEMS : CATALOG_ITEMS.filter((i) => i.category === category);

    filtered.forEach((item) => {
      const card = document.createElement('div');
      card.className = 'catalog-card';
      card.innerHTML = `
        <div class="catalog-card-icon">${item.icon}</div>
        <div class="catalog-card-meta">
          <span class="catalog-card-name">${item.name}</span>
          <span class="catalog-card-dims">${item.dims}</span>
        </div>
        <div class="catalog-card-add-btn"><span>+ 공간에 배치</span></div>
      `;
      card.addEventListener('click', () => {
        placeFurnitureInRoom(item.create());
      });
      DOM.catalogGrid.appendChild(card);
    });
  }

  function updateLayersListUI() {
    if (!DOM.layersList) return;
    DOM.layersList.innerHTML = '';
    if (state.placedItems.length === 0) {
      DOM.layersList.innerHTML = `<div style="text-align:center; padding:24px 12px; color:var(--text-dim); font-size:12px;">배치된 가구가 없습니다.</div>`;
      return;
    }

    state.placedItems.forEach((item) => {
      const isSel = state.selectedObject === item;
      const catItem = CATALOG_ITEMS.find((c) => c.id === item.userData.type);
      const icon = catItem ? catItem.icon : '📦';

      const row = document.createElement('div');
      row.className = `layer-item ${isSel ? 'active' : ''}`;
      row.innerHTML = `
        <div class="layer-item-info">
          <span class="layer-icon">${icon}</span>
          <span class="layer-name">${item.userData.name}</span>
        </div>
        <button class="layer-del-btn" title="삭제">✕</button>
      `;

      row.addEventListener('click', (e) => {
        if (e.target.classList.contains('layer-del-btn')) return;
        selectFurniture(item);
      });

      row.querySelector('.layer-del-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        selectFurniture(item);
        deleteSelectedFurniture();
      });

      DOM.layersList.appendChild(row);
    });
  }

  function updatePlacedStats() {
    if (DOM.placedCount) DOM.placedCount.textContent = `${state.placedItems.length}개`;
  }

  let toastTimer = null;
  function showToast(msg) {
    if (!DOM.toast) return;
    DOM.toast.textContent = msg;
    DOM.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => DOM.toast.classList.remove('show'), 2800);
  }

  function toggleLightingMode() {
    state.lighting.isDay = !state.lighting.isDay;
    const isDay = state.lighting.isDay;

    if (isDay) {
      scene.background.set('#090d16');
      ambientLight.color.set('#ffffff');
      ambientLight.intensity = 0.6;
      dirLight.intensity = 1.05;
      nightRoomLight.intensity = 0;
      DOM.btnToggleLight.querySelector('.icon').textContent = '☀️';
      DOM.btnToggleLight.querySelector('.btn-text').textContent = '주간 모드';
      showToast('주간 자연광 모드로 전환되었습니다.');
    } else {
      scene.background.set('#020617');
      ambientLight.color.set('#1e293b');
      ambientLight.intensity = 0.2;
      dirLight.intensity = 0.15;
      nightRoomLight.intensity = 1.3;
      DOM.btnToggleLight.querySelector('.icon').textContent = '🌙';
      DOM.btnToggleLight.querySelector('.btn-text').textContent = '야간 모드';
      showToast('아늑한 야간 무드등 모드로 전환되었습니다.');
    }
  }

  /**
   * 도면 일치 기본 가구 쇼룸 배치 (컴팩트 규격 및 쾌적한 동선 반영)
   */
  function loadApartmentStarterFurniture() {
    // 1. 거실 (3.6m × 3.9m): 소파, 소파 테이블, TV장, 무드 스탠드, 화분
    const sofa = FurnitureFactory.createSofa('#475569');
    sofa.position.set(-0.525, 0, 2.2);
    sofa.rotation.y = Math.PI; // TV를 향해 정면 배치
    placeFurnitureInRoom(sofa, sofa.position);

    const coffeeTable = FurnitureFactory.createCoffeeTable();
    coffeeTable.position.set(-0.525, 0, 1.3);
    placeFurnitureInRoom(coffeeTable, coffeeTable.position);

    const tv = FurnitureFactory.createSmartTV();
    tv.position.set(-0.525, 0, 0.1); // 침실 분할벽에 기대어 배치
    placeFurnitureInRoom(tv, tv.position);

    const lampLiving = FurnitureFactory.createFloorLamp();
    lampLiving.position.set(0.65, 0, 2.2);
    placeFurnitureInRoom(lampLiving, lampLiving.position);

    const plantLiving = FurnitureFactory.createPlant();
    plantLiving.position.set(-1.7, 0, 2.6);
    placeFurnitureInRoom(plantLiving, plantLiving.position);

    // 2. 침실 (3.6m × 3.0m): 퀸사이즈 침대 & 협탁, 미니멀 책장
    const bed = FurnitureFactory.createBed('#3b82f6');
    bed.position.set(-0.525, 0, -2.1); // 상단 벽 쪽으로 헤드보드 배치
    placeFurnitureInRoom(bed, bed.position);

    const bookshelf = FurnitureFactory.createBookshelf();
    bookshelf.position.set(-1.8, 0, -1.8);
    bookshelf.rotation.y = Math.PI / 2;
    placeFurnitureInRoom(bookshelf, bookshelf.position);

    // 3. 주방 및 식당 (2.4m × 5.3m): 4인 식탁 세트, 4도어 냉장고
    const dining = FurnitureFactory.createDiningTable();
    dining.position.set(2.45, 0, 0.7);
    placeFurnitureInRoom(dining, dining.position);

    const fridge = FurnitureFactory.createRefrigerator();
    fridge.position.set(3.15, 0, 2.2);
    fridge.rotation.y = -Math.PI / 2;
    placeFurnitureInRoom(fridge, fridge.position);

    // 4. 발코니 (1.35m × 6.9m): 라운지 체어 & 대형 몬스테라 화분
    const lounge = FurnitureFactory.createLoungeChair('#059669');
    lounge.position.set(-3.0, 0, 0.4);
    lounge.rotation.y = Math.PI / 2;
    placeFurnitureInRoom(lounge, lounge.position);

    const plantBalcony = FurnitureFactory.createPlant();
    plantBalcony.position.set(-3.0, 0, -1.9);
    placeFurnitureInRoom(plantBalcony, plantBalcony.position);

    selectFurniture(sofa);
  }

  function onWindowResize() {
    if (!canvasContainer || !camera || !renderer) return;
    camera.aspect = canvasContainer.clientWidth / canvasContainer.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
  }

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
    updateRoomTagsProjection();
  }

  // --------------------------------------------------------------------------
  // Entry Point
  // --------------------------------------------------------------------------
  window.addEventListener('DOMContentLoaded', () => {
    cacheDOMElements();
    bindUIEvents();
    renderCatalog('all');
    initThree();
    loadApartmentStarterFurniture();
  });

})();
