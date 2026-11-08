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

const PLAYER_SPEED = 2.2;
const EARTH_RADIUS_M = 6_371_000;
const AVATAR_COLORS: Record<string, number> = {
  moss: 0x9de2b1,
  ember: 0xf3a37b,
  wave: 0x79c6d4,
  sun: 0xf0d36e,
  comet: 0xc3a7ee,
  bloom: 0xed9ab8,
};

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
  private graphics!: Phaser.GameObjects.Graphics;
  private touchBase!: Phaser.GameObjects.Arc;
  private touchKnob!: Phaser.GameObjects.Arc;
  private touchVector = new Phaser.Math.Vector2();
  private touchPointerId: number | null = null;

  constructor() {
    super("world");
  }

  create(): void {
    this.graphics = this.add.graphics();
    this.drawWorld();
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

    const touchEnabled = navigator.maxTouchPoints > 0;
    this.touchBase = this.add.circle(0, 0, 48, 0x101a18, 0.55)
      .setStrokeStyle(2, 0xc3d7c8, 0.55)
      .setScrollFactor(0)
      .setDepth(1000)
      .setVisible(touchEnabled);
    this.touchKnob = this.add.circle(0, 0, 19, 0x9de2b1, 0.9)
      .setScrollFactor(0)
      .setDepth(1001)
      .setVisible(touchEnabled);
    if (touchEnabled) {
      this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
        const height = this.scale.gameSize.height;
        if (this.touchPointerId !== null || pointer.x > 160 || pointer.y < height - 180) {
          return;
        }
        this.touchPointerId = pointer.id;
        this.updateTouchStick(pointer.x, pointer.y);
      });
      this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
        if (pointer.id === this.touchPointerId) {
          this.updateTouchStick(pointer.x, pointer.y);
        }
      });
      const releaseTouch = (pointer: Phaser.Input.Pointer) => {
        if (pointer.id === this.touchPointerId) {
          this.touchPointerId = null;
          this.touchVector.set(0, 0);
          this.positionTouchStick();
        }
      };
      this.input.on("pointerup", releaseTouch);
      this.input.on("pointerupoutside", releaseTouch);
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
    this.positionTouchStick();

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
    this.world = world;
    if (!this.graphics) {
      return;
    }
    this.drawWorld();
    this.playerX = world.width_m / 2;
    this.playerY = world.height_m / 2;
    this.player.setPosition(this.playerX, this.playerY);
    this.cameras.main.setBounds(0, 0, world.width_m, world.height_m);
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
    const circle = this.add.circle(0, 0, 7, color).setStrokeStyle(2, 0xf2f7da);
    const name = this.add.text(0, 13, label, {
      color: "#edf5e9",
      fontFamily: "Manrope, sans-serif",
      fontSize: "11px",
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

  private updateTouchStick(pointerX: number, pointerY: number): void {
    const centerX = 76;
    const centerY = this.scale.gameSize.height - 76;
    const deltaX = pointerX - centerX;
    const deltaY = pointerY - centerY;
    const distance = Math.hypot(deltaX, deltaY);
    const radius = 34;
    const clampedDistance = Math.min(distance, radius);

    this.touchVector.set(
      distance > 8 ? deltaX / distance : 0,
      distance > 8 ? deltaY / distance : 0,
    );
    this.touchKnob.setPosition(
      centerX + (distance ? deltaX / distance : 0) * clampedDistance,
      centerY + (distance ? deltaY / distance : 0) * clampedDistance,
    );
  }

  private positionTouchStick(): void {
    if (this.touchPointerId !== null) {
      return;
    }
    const centerX = 76;
    const centerY = this.scale.gameSize.height - 76;
    this.touchBase.setPosition(centerX, centerY);
    this.touchKnob.setPosition(centerX, centerY);
  }

  private drawWorld(): void {
    this.graphics.clear();
    this.graphics.fillStyle(0x172722, 1);
    this.graphics.fillRect(0, 0, this.world.width_m, this.world.height_m);
    this.graphics.lineStyle(1, 0x263a32, 0.7);

    for (let x = 0; x <= this.world.width_m; x += 40) {
      this.graphics.lineBetween(x, 0, x, this.world.height_m);
    }
    for (let y = 0; y <= this.world.height_m; y += 40) {
      this.graphics.lineBetween(0, y, this.world.width_m, y);
    }

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
          fontSize: "10px",
          stroke: "#101a18",
          strokeThickness: 3,
        });
        this.add.container(0, 0, [marker, label]);
      }
    }
  }
}