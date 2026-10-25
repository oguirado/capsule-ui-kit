import type { DefineComponent, Component } from 'vue';
import type { LayoutProfileEnvelope, LayoutProfileScope } from '../src/workspace/layoutProfile.js';
import type { createPublicProjectionCoordinator } from '../src/state/publicProjection.js';
export type ProjectionView = ReturnType<ReturnType<typeof createPublicProjectionCoordinator>['getView']>;
export interface LayoutStorage {
  readRaw(): Promise<string | null>;
  writeAtomic(payload: string, meta: {ownerWindowId: string; scope: LayoutProfileScope}): Promise<void>;
}
/** Public SFC props. Raw helper exports remain implementation details tested by the kit. */
export declare const DockWorkspace: DefineComponent<{
  scope: LayoutProfileScope; storage: LayoutStorage; defaultProfile?: LayoutProfileEnvelope;
  tabComponents?: Record<string, Component>; defaultTabComponent?: string;
  ownerWindowId?: string; panelComponents?: Record<string, Component>; colorScheme?: string; density?: string;
  workspaceTitle?: string; initialViewportWidth?: number; initialViewportHeight?: number;
}>;
export declare const CapsulePanel: DefineComponent<{
  externalAiSlot?: boolean; capsuleId: string; presentationInstance?: string; placeholderTitle?: string; presentationStatus?: string;
  projectionView?: ProjectionView; initialGeometry?: {x:number;y:number;width:number;height:number}; hasKeyboardOwnership?: boolean;
}>;
export declare const OrchestratorDrawer: DefineComponent<{
  workspaceId?: string; instanceId?: string; initialHeightPx?: number; sessions?: unknown[];
  envelopeSession?: string; senderInstance?: string;
}>;
export declare const TerminalView: DefineComponent<{
  embedded?: boolean; streamRegistry?: Record<string, any>; placeholder?: boolean; sessionId: string; capsuleId: string; sessionTitle?: string; slotId?: string; presentationInstance?: string;
  epoch?: number; generation?: number; mode?: string; attachmentState?: string; activityState?: string;
  viewRetention?: string; hasControlLease?: boolean; folded?: boolean; contrast?: string; reducedMotion?: boolean;
}>;

export declare const MultiSlot: DefineComponent<{
  capsuleId: string; capsuleTitle: string; projection?: Record<string, unknown>; epoch?: number; generation?: number;
  attachmentAvailable?: boolean; consoleMode?: string; liveSurfaceCount?: number; hasKeyboardOwnership?: boolean; underAiCommand?: boolean; presentationInstance?: string;
}>;
export declare const TargetPicker: DefineComponent<{
  sessions?: unknown[]; modelValue?: unknown[]; workspaceId?: string; epoch?: number; allowQueue?: boolean;
  viewedSessionId?: string; focusedTerminalSessionId?: string; controllingSessionId?: string;
}>;
export declare const DispatchResults: DefineComponent<{ dispatches?: unknown[]; maxStreamBytes?: number }>;
