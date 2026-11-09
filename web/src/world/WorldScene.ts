import Phaser from "phaser";

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
  locations: WorldLocation[];
  beacons: Array<{ id: string; service_uuid: string; x_m: number; y_m: number; tx_power: number; path_loss: number }>;
}

export interface WorldFeature {
  id: string;
  name: string;
  kind: "building" | "poi";
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
const EARTH_RADIUS_M = 6_371_000;
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
  private cityFeatures: WorldFeature[] = [];
  private featureLabels: Phaser.GameObjects.Text[] = [];

  constructor() {
    super("world");
  }

  create(): void {
    this.cityGraphics = this.add.graphics();
    this.cameras.main.setZoom(WORLD_CAMERA_ZOOM);
    this.drawCity();
    this.drawLocations();
    this.player = this.makePlayer(0x9de2b1, "Voce");
    this.playerX = this.world.width_m / 2;
    this.playerY = this.world.height_m / 2;
    this.player.setPosition(this.playerX, this.playerY);
    this.cameras.main.setBounds(0, 0, this.world.width_m, this.world.height_m);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

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
    if (movement.lengthSq() > 0) {
      const speed = PLAYER_SPEED * (delta / 1000);
      this.playerX = Phaser.Math.Clamp(this.playerX + movement.x * speed, 8, this.world.width_m - 8);
      this.playerY = Phaser.Math.Clamp(this.playerY + movement.y * speed, 8, this.world.height_m - 8);
      this.player.setPosition(this.playerX, this.playerY);
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
    this.cityFeatures = [];
    this.cameras.main.setZoom(WORLD_CAMERA_ZOOM);
    this.drawCity();
    this.drawLocations();
    this.playerX = this.world.width_m / 2;
    this.playerY = this.world.height_m / 2;
    this.player.setPosition(this.playerX, this.playerY);
    this.cameras.main.setBounds(0, 0, this.world.width_m, this.world.height_m);
  }

  setFeatures(features: WorldFeature[]): void {
    this.cityFeatures = features;
    this.drawCity();
  }

  setTouchMovement(x: number, y: number): void {
    this.touchVector.set(x, y).limit(1);
  }

  setLocalGeoPosition(latitude: number, longitude: number): { x: number; y: number } | null {
    if (!this.world.center) {
      return null;
    }
    const centerLatitude = Phaser.Math.DegToRad(this.world.center.lat);
    const xMeters = EARTH_RADIUS_M
      * Phaser.Math.DegToRad(longitude - this.world.center.lon)
      * Math.cos(centerLatitude);
    const yMeters = -EARTH_RADIUS_M * Phaser.Math.DegToRad(latitude - this.world.center.lat);
    this.playerX = Phaser.Math.Clamp(this.world.width_m / 2 + xMeters, 8, this.world.width_m - 8);
    this.playerY = Phaser.Math.Clamp(this.world.height_m / 2 + yMeters, 8, this.world.height_m - 8);
    this.player.setPosition(this.playerX, this.playerY);
    return { x: this.playerX, y: this.playerY };
  }

  setLocalIdentity(username: string, avatar: string): void {
    this.updatePlayerStyle(this.player, AVATAR_COLORS[avatar] ?? 0x9de2b1, username);
  }

  getLocalPosition(): { x: number; y: number } {
    return { x: this.playerX, y: this.playerY };
  }

  setLocalMapPosition(x: number, y: number): void {
    this.playerX = Phaser.Math.Clamp(x, 8, this.world.width_m - 8);
    this.playerY = Phaser.Math.Clamp(y, 8, this.world.height_m - 8);
    this.player.setPosition(this.playerX, this.playerY);
  }

  updateRemotePlayer(remote: RemotePlayer): void {
    let container = this.remotes.get(remote.id);
    if (!container) {
      container = this.makePlayer(AVATAR_COLORS[remote.avatar] ?? 0x79c6d4, remote.username);
      this.remotes.set(remote.id, container);
    } else {
      this.updatePlayerStyle(container, AVATAR_COLORS[remote.avatar] ?? 0x79c6d4, remote.username);
    }
    container.setPosition(remote.x, remote.y);
  }

  removeRemotePlayer(id: string): void {
    this.remotes.get(id)?.destroy();
    this.remotes.delete(id);
  }

  private makePlayer(color: number, label: string): Phaser.GameObjects.Container {
    const circle = this.add.circle(0, 0, 11, color).setStrokeStyle(2, 0xf2f7da);
    const name = this.add.text(0, 13, label, {
      color: "#edf5e9",
      fontFamily: "Manrope, sans-serif",
      fontSize: "18px",
      stroke: "#101a18",
      strokeThickness: 3,
    }).setOrigin(0.5, 0);
    return this.add.container(0, 0, [circle, name]);
  }

  private updatePlayerStyle(container: Phaser.GameObjects.Container, color: number, label: string): void {
    const circle = container.getAt(0) as Phaser.GameObjects.Arc;
    const name = container.getAt(1) as Phaser.GameObjects.Text;
    circle.setFillStyle(color);
    name.setText(label);
  }

  private drawCity(): void {
    if (!this.cityGraphics) {
      return;
    }
    this.cityGraphics.clear();
    this.cityGraphics.fillStyle(0x26372b, 1);
    this.cityGraphics.fillRect(0, 0, this.world.width_m, this.world.height_m);
    for (const label of this.featureLabels) {
      label.destroy();
    }
    this.featureLabels = [];

    const features = [...this.cityFeatures].sort((first, second) => first.y - second.y);
    let labelsDrawn = 0;
    for (const feature of features) {
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
    this.featureLabels.push(label);
  }

  private buildingDepth(feature: WorldFeature): number {
    return Phaser.Math.Clamp((feature.height_m ?? 12) * 0.55, 6, 44);
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
        const x = this.world.width_m / 2 + EARTH_RADIUS_M * longitudeOffset
          * Math.cos(Phaser.Math.DegToRad(this.world.center.lat));
        const y = this.world.height_m / 2 - EARTH_RADIUS_M * latitudeOffset;
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
}