import Phaser from "phaser";
import { OGA_AVATARS, getAvatarOption } from "../avatarCatalog";

export interface WorldLocation {
  name: string;
  category: string;
  lat: number;
  lon: number;
  description: string;
}

export interface WorldData {
  name: string;
  center: { lat: number; lon: number } | null;
  width_m: number;
  height_m: number;
  tile_x?: number;
  tile_y?: number;
  locations: WorldLocation[];
  beacons: Array<{ id: string; service_uuid: string; x_m: number; y_m: number; tx_power: number; path_loss: number }>;
}

export interface WorldFeature {
  id: string;
  name: string;
  kind: "building" | "poi" | "water";
  category: string;
  x: number;
  y: number;
  points: Array<[number, number]>;
  height_m?: number;
}

export interface RemotePlayer {
  id: string;
  username: string;
  avatar: string;
  x: number;
  y: number;
  lat?: number;
  lon?: number;
  accuracy?: number;
  source?: "gps" | "ble" | "local";
}

const PLAYER_SPEED = 120;
const WORLD_CAMERA_ZOOM = 0.5;
const TILE_SIZE_METERS = 5000;
const MAX_WORLD_CAMERA_ZOOM = 1.8;
const PLAYER_COLLISION_RADIUS = 11;
const EARTH_RADIUS_M = 6_371_000;
const SATELLITE_EXPORT_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export";
const AVATAR_COLORS: Record<string, number> = {
  moss: 0x9de2b1,
  ember: 0xf3a37b,
  wave: 0x79c6d4,
  sun: 0xf0d36e,
  comet: 0xc3a7ee,
  bloom: 0xed9ab8,
};
const BUILDING_PALETTES = [
  { roof: 0xb9c99a, wall: 0x758c68, side: 0x4c644f, trim: 0xd5d9ae },
  { roof: 0xd7b58b, wall: 0x9c745d, side: 0x704f44, trim: 0xe7d0a6 },
  { roof: 0x9ebfc0, wall: 0x668d8c, side: 0x41696b, trim: 0xc3d7c8 },
  { roof: 0xd3c58b, wall: 0x9d8b5a, side: 0x716943, trim: 0xf0dda0 },
  { roof: 0xc7b5ca, wall: 0x89758f, side: 0x62556e, trim: 0xe0cee0 },
];

export class WorldScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Container;
  private playerX = 0;
  private playerY = 0;
  private world: WorldData = {
    name: "Evento local",
    center: null,
    width_m: 1200,
    height_m: 800,
    locations: [],
    beacons: [],
  };
  private keys!: Record<"up" | "down" | "left" | "right", Phaser.Input.Keyboard.Key>;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private remotes = new Map<string, Phaser.GameObjects.Container>();
  private lastBroadcast = 0;
  private touchVector = new Phaser.Math.Vector2();
  private locationObjects: Phaser.GameObjects.GameObject[] = [];
  private cityGraphics!: Phaser.GameObjects.Graphics;
  private worldBoundary!: Phaser.GameObjects.Graphics;
  private satelliteImage: Phaser.GameObjects.Image | null = null;
  private satelliteEnabled = false;
  private satelliteRequestId = 0;
  private cityFeatures: WorldFeature[] = [];
  private featureLabels: Phaser.GameObjects.Text[] = [];
  private showFeatureNames = false;
  private buildingColliders: Array<{
    points: Array<[number, number]>;
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  }> = [];
  private cameraZoom = WORLD_CAMERA_ZOOM;
  private cameraFollowingPlayer = true;
  private centerPlayerOnZoom = false;
  private followPlayerEnabled = true;
  private compassRotationEnabled = false;
  private playerHeading = 0;
  private tileX = 0;
  private tileY = 0;
  private tileTransitionPending = false;

  constructor() {
    super("world");
  }

  preload(): void {
    for (const avatar of OGA_AVATARS) {
      if (avatar.image) {
        this.load.image(avatar.id, avatar.image);
      }
    }
  }

  create(): void {
    this.cityGraphics = this.add.graphics();
    this.worldBoundary = this.add.graphics().setDepth(15);
    this.cameras.main.setZoom(WORLD_CAMERA_ZOOM);
    this.drawCity();
    this.drawWorldBoundary();
    this.drawLocations();
    this.player = this.makePlayer(0x9de2b1, "Voce", "moss");
    this.playerX = this.world.width_m / 2;
    this.playerY = this.world.height_m / 2;
    this.player.setPosition(this.playerX, this.playerY);
    this.cameras.main.setBounds(0, 0, this.world.width_m, this.world.height_m);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.applyCameraRotation();
    this.setZoom(this.cameraZoom);

    const keyboard = this.input.keyboard;
    if (keyboard) {
      this.keys = keyboard.addKeys({
        up: Phaser.Input.Keyboard.KeyCodes.W,
        down: Phaser.Input.Keyboard.KeyCodes.S,
        left: Phaser.Input.Keyboard.KeyCodes.A,
        right: Phaser.Input.Keyboard.KeyCodes.D,
      }) as typeof this.keys;
      this.cursors = keyboard.createCursorKeys();
    }

  }

  update(time: number, delta: number): void {
    const movement = new Phaser.Math.Vector2(
      (this.keys && this.cursors
        ? Number(this.keys.right.isDown || this.cursors.right.isDown)
          - Number(this.keys.left.isDown || this.cursors.left.isDown)
        : 0) + this.touchVector.x,
      (this.keys && this.cursors
        ? Number(this.keys.down.isDown || this.cursors.down.isDown)
          - Number(this.keys.up.isDown || this.cursors.up.isDown)
        : 0) + this.touchVector.y,
    ).normalize();
    if (!this.tileTransitionPending && movement.lengthSq() > 0) {
      const speed = PLAYER_SPEED * (delta / 1000);
      const nextX = this.playerX + movement.x * speed;
      const nextY = this.playerY + movement.y * speed;
      if (nextX < 0 || nextX >= this.world.width_m || nextY < 0 || nextY >= this.world.height_m) {
        const nextTileX = this.tileX + (nextX < 0 ? -1 : nextX >= this.world.width_m ? 1 : 0);
        const nextTileY = this.tileY + (nextY < 0 ? 1 : nextY >= this.world.height_m ? -1 : 0);
        const localX = nextX < 0 ? this.world.width_m + nextX : nextX >= this.world.width_m ? nextX - this.world.width_m : nextX;
        const localY = nextY < 0 ? this.world.height_m + nextY : nextY >= this.world.height_m ? nextY - this.world.height_m : nextY;
        this.requestTileTransition(nextTileX, nextTileY, localX, localY);
      } else {
        if (this.canOccupy(nextX, this.playerY)) {
          this.playerX = nextX;
        }
        if (this.canOccupy(this.playerX, nextY)) {
          this.playerY = nextY;
        }
        this.player.setPosition(this.playerX, this.playerY);
      }
    }

    if (time - this.lastBroadcast >= 250) {
      this.lastBroadcast = time;
      this.events.emit("position", { x: this.playerX, y: this.playerY });
    }
  }

  setWorld(world: WorldData): void {
    this.world = {
      ...world,
      width_m: Math.min(world.width_m, 5000),
      height_m: Math.min(world.height_m, 5000),
    };
    this.tileX = world.tile_x ?? 0;
    this.tileY = world.tile_y ?? 0;
    this.tileTransitionPending = false;
    this.cityFeatures = [];
    this.buildingColliders = [];
    this.cameras.main.setZoom(this.cameraZoom);
    this.drawCity();
    this.drawWorldBoundary();
    this.drawLocations();
    this.playerX = this.world.width_m / 2;
    this.playerY = this.world.height_m / 2;
    this.player.setPosition(this.playerX, this.playerY);
    this.cameras.main.setBounds(0, 0, this.world.width_m, this.world.height_m);
    this.cameraFollowingPlayer = true;
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.setZoom(this.cameraZoom);
  }

  setTile(tileX: number, tileY: number, x: number, y: number): void {
    this.satelliteRequestId += 1;
    this.clearSatelliteImage();
    this.tileX = tileX;
    this.tileY = tileY;
    this.tileTransitionPending = false;
    this.cityFeatures = [];
    this.buildingColliders = [];
    this.drawCity();
    this.drawWorldBoundary();
    this.drawLocations();
    this.playerX = Phaser.Math.Clamp(x, 8, this.world.width_m - 8);
    this.playerY = Phaser.Math.Clamp(y, 8, this.world.height_m - 8);
    this.player.setPosition(this.playerX, this.playerY);
    this.cameraFollowingPlayer = true;
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.cameras.main.centerOn(this.playerX, this.playerY);
    this.events.emit("camera-mode", true);
    if (this.satelliteEnabled) {
      void this.loadSatelliteBackground().catch((error: unknown) => {
        this.events.emit("satellite-error", error instanceof Error ? error.message : "Falha ao carregar imagem de satelite.");
      });
    }
  }

  cancelTileTransition(): void {
    this.tileTransitionPending = false;
    this.touchVector.set(0, 0);
  }

  setFeatures(features: WorldFeature[]): void {
    this.cityFeatures = features;
    this.buildingColliders = features
      .filter((feature) => feature.kind === "building" && feature.points.length >= 3)
      .map((feature) => ({
        points: feature.points,
        minX: Math.min(...feature.points.map(([x]) => x)),
        maxX: Math.max(...feature.points.map(([x]) => x)),
        minY: Math.min(...feature.points.map(([, y]) => y)),
        maxY: Math.max(...feature.points.map(([, y]) => y)),
      }));
    if (!this.canOccupy(this.playerX, this.playerY)) {
      [this.playerX, this.playerY] = this.nearestWalkablePosition(this.playerX, this.playerY);
      this.player.setPosition(this.playerX, this.playerY);
    }
    this.drawCity();
  }

  setTouchMovement(x: number, y: number): void {
    this.touchVector.set(x, y).limit(1);
  }

  setLocalGeoPosition(latitude: number, longitude: number): { x: number; y: number } | null {
    if (!this.world.center || this.tileTransitionPending) {
      return null;
    }
    const centerLatitude = Phaser.Math.DegToRad(this.world.center.lat);
    const eastMeters = EARTH_RADIUS_M
      * Phaser.Math.DegToRad(longitude - this.world.center.lon)
      * Math.cos(centerLatitude);
    const northMeters = EARTH_RADIUS_M * Phaser.Math.DegToRad(latitude - this.world.center.lat);
    const tileX = Math.floor((eastMeters + TILE_SIZE_METERS / 2) / TILE_SIZE_METERS);
    const tileY = Math.floor((northMeters + TILE_SIZE_METERS / 2) / TILE_SIZE_METERS);
    const x = eastMeters - tileX * TILE_SIZE_METERS + TILE_SIZE_METERS / 2;
    const y = TILE_SIZE_METERS / 2 - (northMeters - tileY * TILE_SIZE_METERS);
    if (tileX !== this.tileX || tileY !== this.tileY) {
      this.requestTileTransition(tileX, tileY, x, y);
      return null;
    }
    this.setLocalMapPosition(x, y);
    return this.getLocalPosition();
  }

  setLocalEventPosition(x: number, y: number): void {
    const eastMeters = x - this.world.width_m / 2;
    const northMeters = this.world.height_m / 2 - y;
    const tileX = Math.floor((eastMeters + TILE_SIZE_METERS / 2) / TILE_SIZE_METERS);
    const tileY = Math.floor((northMeters + TILE_SIZE_METERS / 2) / TILE_SIZE_METERS);
    const localX = eastMeters - tileX * TILE_SIZE_METERS + TILE_SIZE_METERS / 2;
    const localY = TILE_SIZE_METERS / 2 - (northMeters - tileY * TILE_SIZE_METERS);
    if (tileX !== this.tileX || tileY !== this.tileY) {
      this.requestTileTransition(tileX, tileY, localX, localY);
      return;
    }
    this.setLocalMapPosition(localX, localY);
  }

  setLocalIdentity(username: string, avatar: string): void {
    this.updatePlayerStyle(this.player, AVATAR_COLORS[avatar] ?? 0x9de2b1, username, avatar);
  }

  setZoom(zoom: number, centerOnPlayer?: boolean): void {
    const camera = this.cameras.main;
    const previousCenterX = camera.scrollX + camera.width / (2 * this.cameraZoom);
    const previousCenterY = camera.scrollY + camera.height / (2 * this.cameraZoom);
    const wasFollowingPlayer = this.cameraFollowingPlayer;
    const shouldCenterOnPlayer = this.followPlayerEnabled && (centerOnPlayer ?? this.centerPlayerOnZoom);
    const fitZoom = Math.min(camera.width / this.world.width_m, camera.height / this.world.height_m);
    const minZoom = Math.max(0.01, Math.min(WORLD_CAMERA_ZOOM, fitZoom * 0.94));
    this.cameraZoom = Phaser.Math.Clamp(zoom, minZoom, MAX_WORLD_CAMERA_ZOOM);
    camera.setZoom(this.cameraZoom);
    this.drawWorldBoundary();
    this.syncFeatureLabelVisibility();
    if (shouldCenterOnPlayer && this.player) {
      this.cameraFollowingPlayer = true;
      camera.startFollow(this.player, true, 0.1, 0.1);
      camera.centerOn(this.playerX, this.playerY);
      this.events.emit("camera-mode", true);
    } else if (this.cameraZoom <= minZoom + 0.001) {
      this.cameraFollowingPlayer = false;
      camera.stopFollow();
      camera.centerOn(this.world.width_m / 2, this.world.height_m / 2);
      this.events.emit("camera-mode", false);
    } else if (this.followPlayerEnabled && (wasFollowingPlayer || this.centerPlayerOnZoom) && this.player) {
      this.cameraFollowingPlayer = true;
      camera.startFollow(this.player, true, 0.1, 0.1);
      camera.centerOn(this.playerX, this.playerY);
      this.events.emit("camera-mode", true);
    } else {
      this.cameraFollowingPlayer = false;
      camera.stopFollow();
      camera.centerOn(previousCenterX, previousCenterY);
      this.events.emit("camera-mode", false);
    }
    this.applyCameraRotation();
  }

  setCenterPlayerOnZoom(enabled: boolean): void {
    this.centerPlayerOnZoom = enabled;
    if (enabled && this.player) {
      this.cameraFollowingPlayer = true;
      this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
      this.cameras.main.centerOn(this.playerX, this.playerY);
      this.events.emit("camera-mode", true);
    }
  }

  setFollowPlayer(enabled: boolean): void {
    this.followPlayerEnabled = enabled;
    if (!enabled) {
      this.cameraFollowingPlayer = false;
      this.cameras.main.stopFollow();
      this.events.emit("camera-mode", false);
      return;
    }
    if (this.player) {
      this.cameraFollowingPlayer = true;
      this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
      this.cameras.main.centerOn(this.playerX, this.playerY);
      this.events.emit("camera-mode", true);
    }
  }

  setCompassRotation(enabled: boolean): void {
    this.compassRotationEnabled = enabled;
    this.applyCameraRotation();
  }

  setPlayerHeading(degrees: number): void {
    this.playerHeading = ((degrees % 360) + 360) % 360;
    this.applyCameraRotation();
  }

  private applyCameraRotation(): void {
    const camera = this.cameras.main;
    camera.setRotation(this.compassRotationEnabled ? -Phaser.Math.DegToRad(this.playerHeading) : 0);
  }

  panCameraBy(screenDeltaX: number, screenDeltaY: number): void {
    const camera = this.cameras.main;
    if (this.cameraFollowingPlayer) {
      this.cameraFollowingPlayer = false;
      camera.stopFollow();
      this.events.emit("camera-mode", false);
    }
    camera.scrollX -= screenDeltaX / camera.zoomX;
    camera.scrollY -= screenDeltaY / camera.zoomY;
  }

  centerCameraOnPlayer(): void {
    const camera = this.cameras.main;
    const fitZoom = Math.min(camera.width / this.world.width_m, camera.height / this.world.height_m);
    const minZoom = Math.max(0.01, Math.min(WORLD_CAMERA_ZOOM, fitZoom * 0.94));
    if (this.cameraZoom <= minZoom + 0.001) {
      this.setZoom(Math.max(WORLD_CAMERA_ZOOM, minZoom + 0.1));
    }
    this.cameraFollowingPlayer = true;
    camera.startFollow(this.player, true, 0.1, 0.1);
    camera.centerOn(this.playerX, this.playerY);
    this.events.emit("camera-mode", true);
  }

  isCameraFollowingPlayer(): boolean {
    return this.cameraFollowingPlayer;
  }

  selectFeatureAtScreenPoint(x: number, y: number): void {
    const point = this.cameras.main.getWorldPoint(x, y);
    this.selectFeatureAtWorldPoint(point.x, point.y);
  }

  getZoom(): number {
    return this.cameraZoom;
  }

  async setSatelliteEnabled(enabled: boolean): Promise<void> {
    this.satelliteEnabled = enabled;
    this.satelliteRequestId += 1;
    if (!enabled) {
      this.clearSatelliteImage();
      this.drawCity();
      return;
    }
    await this.loadSatelliteBackground();
  }

  fitWorldToView(): void {
    const camera = this.cameras.main;
    const fitZoom = Math.min(camera.width / this.world.width_m, camera.height / this.world.height_m);
    this.setZoom(fitZoom * 0.94, false);
  }

  setFeatureNamesVisible(visible: boolean): void {
    this.showFeatureNames = visible;
    this.syncFeatureLabelVisibility();
  }

  getLocalPosition(): { x: number; y: number } {
    return { x: this.playerX, y: this.playerY };
  }

  setLocalMapPosition(x: number, y: number): void {
    if (this.tileTransitionPending) {
      return;
    }
    [this.playerX, this.playerY] = this.nearestWalkablePosition(x, y);
    this.player.setPosition(this.playerX, this.playerY);
  }

  updateRemotePlayer(remote: RemotePlayer): void {
    let container = this.remotes.get(remote.id);
    if (!container) {
      container = this.makePlayer(AVATAR_COLORS[remote.avatar] ?? 0x79c6d4, remote.username, remote.avatar);
      this.remotes.set(remote.id, container);
    } else {
      this.updatePlayerStyle(container, AVATAR_COLORS[remote.avatar] ?? 0x79c6d4, remote.username, remote.avatar);
    }
    container.setPosition(remote.x, remote.y);
  }

  removeRemotePlayer(id: string): void {
    this.remotes.get(id)?.destroy();
    this.remotes.delete(id);
  }

  private makePlayer(color: number, label: string, avatar: string): Phaser.GameObjects.Container {
    const visual = this.makeAvatarVisual(color, avatar);
    const name = this.add.text(0, 13, label, {
      color: "#edf5e9",
      fontFamily: "Manrope, sans-serif",
      fontSize: "18px",
      stroke: "#101a18",
      strokeThickness: 3,
    }).setOrigin(0.5, 0);
    return this.add.container(0, 0, [visual, name]).setData("avatar", avatar).setDepth(30);
  }

  private makeAvatarVisual(color: number, avatar: string): Phaser.GameObjects.GameObject {
    if (getAvatarOption(avatar)?.image && this.textures.exists(avatar)) {
      const sprite = this.add.image(0, 0, avatar);
      const frame = sprite.frame;
      const scale = 28 / Math.max(frame.width, frame.height);
      sprite.setScale(scale).setOrigin(0.5).setDepth(1);
      return sprite;
    }
    return this.add.circle(0, 0, 11, color).setStrokeStyle(2, 0xf2f7da);
  }

  private updatePlayerStyle(container: Phaser.GameObjects.Container, color: number, label: string, avatar: string): void {
    if (container.getData("avatar") !== avatar) {
      const previousVisual = container.getAt(0);
      container.remove(previousVisual, false);
      previousVisual.destroy();
      container.addAt(this.makeAvatarVisual(color, avatar), 0);
      container.setData("avatar", avatar);
    } else if (container.getAt(0) instanceof Phaser.GameObjects.Arc) {
      (container.getAt(0) as Phaser.GameObjects.Arc).setFillStyle(color);
    }
    const name = container.getAt(1) as Phaser.GameObjects.Text;
    name.setText(label);
  }

  private drawCity(): void {
    if (!this.cityGraphics) {
      return;
    }
    this.cityGraphics.clear();
    if (!this.satelliteImage) {
      this.cityGraphics.fillStyle(0x26372b, 1);
      this.cityGraphics.fillRect(0, 0, this.world.width_m, this.world.height_m);
    }
    for (const label of this.featureLabels) {
      label.destroy();
    }
    this.featureLabels = [];

    const renderOrder = { water: 0, building: 1, poi: 2 } as const;
    const features = [...this.cityFeatures].sort((first, second) => (
      renderOrder[first.kind] - renderOrder[second.kind] || first.y - second.y
    ));
    let labelsDrawn = 0;
    for (const feature of features) {
      if (feature.kind === "water") {
        this.drawWater(feature);
        continue;
      }
      if (feature.kind === "building" && feature.points.length >= 3) {
        this.drawBuilding(feature);
        if (labelsDrawn < 220) {
          const height = this.buildingDepth(feature);
          this.addFeatureLabel(feature, feature.x + height * 0.42, feature.y - height * 0.72 - 10);
          labelsDrawn += 1;
        }
      } else {
        this.drawPoi(feature);
        if (labelsDrawn < 220) {
          this.addFeatureLabel(feature, feature.x + 14, feature.y - 12);
          labelsDrawn += 1;
        }
      }
    }
  }

  private drawWater(feature: WorldFeature): void {
    if (feature.points.length < 3) {
      return;
    }
    const color = ["sea", "ocean"].includes(feature.category) ? 0x347f9b : 0x43849a;
    this.drawPolygon(feature.points, color, 0x78c6d6, 1.5);
  }

  private async loadSatelliteBackground(): Promise<void> {
    if (!this.world.center) {
      throw new Error("Defina o centro do evento antes de ativar o satelite.");
    }
    const requestId = ++this.satelliteRequestId;
    const originLatitude = this.world.center.lat;
    const latitudeRadians = Phaser.Math.DegToRad(originLatitude);
    const tileCenterLatitude = originLatitude + Phaser.Math.RadToDeg(this.tileY * TILE_SIZE_METERS / EARTH_RADIUS_M);
    const tileCenterLongitude = this.world.center.lon
      + Phaser.Math.RadToDeg(this.tileX * TILE_SIZE_METERS / (EARTH_RADIUS_M * Math.max(Math.cos(latitudeRadians), 0.01)));
    const halfLatitude = Phaser.Math.RadToDeg(TILE_SIZE_METERS / (2 * EARTH_RADIUS_M));
    const halfLongitude = Phaser.Math.RadToDeg(TILE_SIZE_METERS / (2 * EARTH_RADIUS_M * Math.max(Math.cos(latitudeRadians), 0.01)));
    const parameters = new URLSearchParams({
      bbox: `${tileCenterLongitude - halfLongitude},${tileCenterLatitude - halfLatitude},${tileCenterLongitude + halfLongitude},${tileCenterLatitude + halfLatitude}`,
      bboxSR: "4326",
      imageSR: "4326",
      size: "1024,1024",
      format: "jpg",
      f: "image",
    });
    const image = new Image();
    image.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Imagem de satelite indisponivel."));
      image.src = `${SATELLITE_EXPORT_URL}?${parameters.toString()}`;
    });
    if (!this.satelliteEnabled || requestId !== this.satelliteRequestId) {
      return;
    }

    const textureKey = `satellite-${this.tileX}-${this.tileY}-${requestId}`;
    this.textures.addImage(textureKey, image);
    this.clearSatelliteImage();
    this.satelliteImage = this.add.image(
      this.world.width_m / 2,
      this.world.height_m / 2,
      textureKey,
    ).setOrigin(0.5).setDisplaySize(this.world.width_m, this.world.height_m).setDepth(-10);
    this.drawCity();
  }

  private clearSatelliteImage(): void {
    if (!this.satelliteImage) {
      return;
    }
    const textureKey = this.satelliteImage.texture.key;
    this.satelliteImage.destroy();
    this.satelliteImage = null;
    this.textures.remove(textureKey);
  }

  private drawWorldBoundary(): void {
    if (!this.worldBoundary) {
      return;
    }
    this.worldBoundary.clear();
    const lineWidth = 3 / Math.max(this.cameraZoom, 0.01);
    this.worldBoundary.lineStyle(lineWidth, 0xf0cf57, 0.95);
    this.worldBoundary.strokeRect(
      lineWidth / 2,
      lineWidth / 2,
      this.world.width_m - lineWidth,
      this.world.height_m - lineWidth,
    );
  }

  private drawBuilding(feature: WorldFeature): void {
    const palette = BUILDING_PALETTES[this.stablePalette(feature)];
    const depth = this.buildingDepth(feature);
    const offsetX = depth * 0.42;
    const offsetY = -depth * 0.72;
    const roof = feature.points.map(([x, y]) => [x + offsetX, y + offsetY] as [number, number]);

    this.drawPolygon(
      feature.points.map(([x, y]) => [x + 4, y + 6]),
      0x152319,
      0x152319,
      0,
    );

    for (let index = 0; index < feature.points.length; index += 1) {
      const next = (index + 1) % feature.points.length;
      const first = feature.points[index];
      const second = feature.points[next];
      this.drawPolygon(
        [first, second, roof[next], roof[index]],
        index % 2 === 0 ? palette.wall : palette.side,
        palette.side,
        1,
      );
      if (index % 2 === 0) {
        this.drawWindows(first, second, offsetX, offsetY, palette.trim);
      }
    }
    this.drawPolygon(roof, palette.roof, palette.trim, 1.2);

    const roofCenter = this.averagePoint(roof);
    this.cityGraphics.fillStyle(palette.trim, 0.65);
    this.cityGraphics.fillRoundedRect(roofCenter[0] - 6, roofCenter[1] - 3, 12, 6, 2);
  }

  private drawWindows(
    first: [number, number],
    second: [number, number],
    offsetX: number,
    offsetY: number,
    color: number,
  ): void {
    const edgeLength = Phaser.Math.Distance.Between(first[0], first[1], second[0], second[1]);
    const count = Phaser.Math.Clamp(Math.floor(edgeLength / 18), 1, 4);
    this.cityGraphics.fillStyle(color, 0.88);
    for (let index = 0; index < count; index += 1) {
      const amount = (index + 1) / (count + 1);
      const x = Phaser.Math.Linear(first[0], second[0], amount) + offsetX * 0.58;
      const y = Phaser.Math.Linear(first[1], second[1], amount) + offsetY * 0.58;
      this.cityGraphics.fillRoundedRect(x - 2, y - 3, 4, 6, 1);
    }
  }

  private drawPoi(feature: WorldFeature): void {
    const color = this.poiColor(feature.category);
    this.cityGraphics.fillStyle(0x17251d, 0.85);
    this.cityGraphics.fillCircle(feature.x + 2, feature.y + 3, 11);
    this.cityGraphics.fillStyle(color, 1);
    this.cityGraphics.fillCircle(feature.x, feature.y, 8);
    this.cityGraphics.lineStyle(2, 0xf3edcf, 1);
    this.cityGraphics.strokeCircle(feature.x, feature.y, 8);
    this.cityGraphics.fillStyle(0xf3edcf, 1);
    this.cityGraphics.fillCircle(feature.x, feature.y, 2);
  }

  private selectFeatureAtWorldPoint(x: number, y: number): void {
    if (!this.cityFeatures.length) {
      return;
    }
    const poiRadius = 18 / this.cameraZoom;
    const poi = [...this.cityFeatures].reverse().find((feature) => (
      feature.kind === "poi"
      && Math.hypot(feature.x - x, feature.y - y) <= poiRadius
    ));
    if (poi) {
      this.events.emit("feature-selected", poi);
      return;
    }

    const building = [...this.cityFeatures].reverse().find((feature) => {
      if (feature.kind !== "building" || feature.points.length < 3) {
        return false;
      }
      if (this.pointInPolygon(x, y, feature.points)) {
        return true;
      }
      const depth = this.buildingDepth(feature);
      const roof = feature.points.map(([x, y]) => [x + depth * 0.42, y - depth * 0.72] as [number, number]);
      return this.pointInPolygon(x, y, roof);
    });
    if (building) {
      this.events.emit("feature-selected", building);
    }
  }

  private drawPolygon(
    points: Array<[number, number]>,
    fillColor: number,
    lineColor: number,
    lineWidth: number,
  ): void {
    if (points.length < 3) {
      return;
    }
    this.cityGraphics.fillStyle(fillColor, 1);
    this.cityGraphics.lineStyle(lineWidth, lineColor, 1);
    this.cityGraphics.beginPath();
    this.cityGraphics.moveTo(points[0][0], points[0][1]);
    for (const point of points.slice(1)) {
      this.cityGraphics.lineTo(point[0], point[1]);
    }
    this.cityGraphics.closePath();
    this.cityGraphics.fillPath();
    if (lineWidth > 0) {
      this.cityGraphics.strokePath();
    }
  }

  private addFeatureLabel(feature: WorldFeature, x: number, y: number): void {
    const label = this.add.text(x, y, feature.name, {
      backgroundColor: feature.kind === "building" ? "#1c2a22ed" : "#263328ed",
      color: "#f2eddb",
      fontFamily: "Manrope, sans-serif",
      fontSize: "14px",
      padding: { x: 5, y: 3 },
      stroke: "#17231b",
      strokeThickness: 2,
    }).setOrigin(0.5, 1).setDepth(20);
    label.setVisible(this.showFeatureNames);
    this.featureLabels.push(label);
  }

  private syncFeatureLabelVisibility(): void {
    const visible = this.showFeatureNames;
    for (const label of this.featureLabels) {
      label.setVisible(visible);
    }
  }

  private buildingDepth(feature: WorldFeature): number {
    return Phaser.Math.Clamp((feature.height_m ?? 12) * 0.55, 6, 44);
  }

  private canOccupy(x: number, y: number): boolean {
    const radiusSquared = PLAYER_COLLISION_RADIUS ** 2;
    for (const collider of this.buildingColliders) {
      if (
        x < collider.minX - PLAYER_COLLISION_RADIUS
        || x > collider.maxX + PLAYER_COLLISION_RADIUS
        || y < collider.minY - PLAYER_COLLISION_RADIUS
        || y > collider.maxY + PLAYER_COLLISION_RADIUS
      ) {
        continue;
      }
      if (this.pointInPolygon(x, y, collider.points)) {
        return false;
      }
      for (let index = 0; index < collider.points.length; index += 1) {
        const first = collider.points[index];
        const second = collider.points[(index + 1) % collider.points.length];
        if (this.distanceToSegmentSquared(x, y, first, second) < radiusSquared) {
          return false;
        }
      }
    }
    return true;
  }

  private nearestWalkablePosition(x: number, y: number): [number, number] {
    const originX = Phaser.Math.Clamp(x, 8, this.world.width_m - 8);
    const originY = Phaser.Math.Clamp(y, 8, this.world.height_m - 8);
    if (this.canOccupy(originX, originY)) {
      return [originX, originY];
    }

    for (let radius = 4; radius <= 500; radius += 4) {
      for (let step = 0; step < 16; step += 1) {
        const angle = step * Math.PI / 8;
        const candidateX = Phaser.Math.Clamp(originX + Math.cos(angle) * radius, 8, this.world.width_m - 8);
        const candidateY = Phaser.Math.Clamp(originY + Math.sin(angle) * radius, 8, this.world.height_m - 8);
        if (this.canOccupy(candidateX, candidateY)) {
          return [candidateX, candidateY];
        }
      }
    }
    return [originX, originY];
  }

  private pointInPolygon(x: number, y: number, points: Array<[number, number]>): boolean {
    let inside = false;
    for (let current = 0, previous = points.length - 1; current < points.length; previous = current, current += 1) {
      const [currentX, currentY] = points[current];
      const [previousX, previousY] = points[previous];
      const intersects = (currentY > y) !== (previousY > y)
        && x < (previousX - currentX) * (y - currentY) / (previousY - currentY) + currentX;
      if (intersects) inside = !inside;
    }
    return inside;
  }

  private distanceToSegmentSquared(
    x: number,
    y: number,
    first: [number, number],
    second: [number, number],
  ): number {
    const deltaX = second[0] - first[0];
    const deltaY = second[1] - first[1];
    const lengthSquared = deltaX * deltaX + deltaY * deltaY;
    const amount = lengthSquared === 0
      ? 0
      : Phaser.Math.Clamp(((x - first[0]) * deltaX + (y - first[1]) * deltaY) / lengthSquared, 0, 1);
    const nearestX = first[0] + amount * deltaX;
    const nearestY = first[1] + amount * deltaY;
    return (x - nearestX) ** 2 + (y - nearestY) ** 2;
  }

  private stablePalette(feature: WorldFeature): number {
    const value = `${feature.category}:${feature.name}`;
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
      hash = (hash * 31 + value.charCodeAt(index)) | 0;
    }
    return Math.abs(hash) % BUILDING_PALETTES.length;
  }

  private averagePoint(points: Array<[number, number]>): [number, number] {
    return [
      points.reduce((sum, point) => sum + point[0], 0) / points.length,
      points.reduce((sum, point) => sum + point[1], 0) / points.length,
    ];
  }

  private poiColor(category: string): number {
    if (["museum", "place_of_worship", "theatre", "historic"].includes(category)) return 0xe2b875;
    if (["cafe", "restaurant", "bar", "pub"].includes(category)) return 0xed9b75;
    if (["shop", "market", "supermarket"].includes(category)) return 0x85c2b0;
    return 0xa8c99a;
  }

  private drawLocations(): void {
    for (const object of this.locationObjects) {
      object.destroy();
    }
    this.locationObjects = [];
    if (this.world.center) {
      for (const location of this.world.locations) {
        const latitudeOffset = Phaser.Math.DegToRad(location.lat - this.world.center.lat);
        const longitudeOffset = Phaser.Math.DegToRad(location.lon - this.world.center.lon);
        const eastMeters = EARTH_RADIUS_M * longitudeOffset
          * Math.cos(Phaser.Math.DegToRad(this.world.center.lat));
        const northMeters = EARTH_RADIUS_M * latitudeOffset;
        const x = this.world.width_m / 2 + eastMeters - this.tileX * TILE_SIZE_METERS;
        const y = this.world.height_m / 2 - northMeters + this.tileY * TILE_SIZE_METERS;
        const marker = this.add.circle(x, y, 5, 0xf0d36e).setStrokeStyle(2, 0x24352c);
        const label = this.add.text(x + 9, y - 7, location.name, {
          color: "#f4e9be",
          fontFamily: "Manrope, sans-serif",
          fontSize: "16px",
          stroke: "#101a18",
          strokeThickness: 3,
        });
        this.locationObjects.push(marker, label);
      }
    }
  }

  private requestTileTransition(tileX: number, tileY: number, x: number, y: number): void {
    if (this.tileTransitionPending) {
      return;
    }
    this.tileTransitionPending = true;
    this.touchVector.set(0, 0);
    if (tileX < this.tileX) this.playerX = 8;
    if (tileX > this.tileX) this.playerX = this.world.width_m - 8;
    if (tileY > this.tileY) this.playerY = 8;
    if (tileY < this.tileY) this.playerY = this.world.height_m - 8;
    this.player.setPosition(this.playerX, this.playerY);
    this.events.emit("tile-request", {
      tile_x: tileX,
      tile_y: tileY,
      x: Phaser.Math.Clamp(x, 8, this.world.width_m - 8),
      y: Phaser.Math.Clamp(y, 8, this.world.height_m - 8),
    });
  }
}