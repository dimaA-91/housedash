import 'server-only';
import { wifiStatus } from '@/features/network/server/service';

export async function queryNetwork() { const state = await wifiStatus(); return { radio: state.radio, wifi: state.wifi ? { connected: state.wifi.connected, signal: state.wifi.signal } : null, ethernet: state.ethernet ? { connected: state.ethernet.connected } : null }; }
