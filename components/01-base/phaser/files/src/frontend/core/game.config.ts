import { AUTO, Scale } from 'phaser';
import type { Types } from 'phaser';
import { createScenes } from './scene.registry.ts';

export function createGameConfig(parent: HTMLElement, canvas: HTMLCanvasElement): Types.Core.GameConfig {
  return {
    type: AUTO, parent, canvas, width: 800, height: 600,
    scale: { mode: Scale.FIT, autoCenter: Scale.CENTER_BOTH },
    scene: createScenes(), audio: { noAudio: true }, banner: false,
  };
}
