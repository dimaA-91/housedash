/** Compatibility facade. Feature logic lives under src/features. */
export { intelligenceTools, executeIntelligenceTool } from '@/features/intelligence/server/registry';
export { intelligenceContext } from '@/features/intelligence/server/context';
export { intelligenceOwner, confirmIntelligenceAction } from '@/features/shared/server/actions';
