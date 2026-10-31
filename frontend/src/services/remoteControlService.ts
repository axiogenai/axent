import { supabase } from './supabaseService';

const REMOTE_CHANNEL_NAME = 'axent_remote_control_channel';
const REMOTE_REFRESH_STORAGE_KEY = 'axent_last_processed_refresh_ts';

export interface RemoteCommandPayload {
  command: 'FORCE_HARD_REFRESH';
  timestamp: number;
  initiator?: string;
}

/**
 * Broadcasts an instant remote hard refresh command to every connected client via Supabase.
 * Uses both Realtime broadcast (<100ms) and persistent database record in candidate_stations.
 */
export async function broadcastRemoteHardRefresh(): Promise<boolean> {
  const timestamp = Date.now();
  let success = false;

  // 1. Mark admin's own local storage so admin doesn't get interrupted immediately if not wanted
  try {
    localStorage.setItem(REMOTE_REFRESH_STORAGE_KEY, String(timestamp));
  } catch {}

  // 2. Realtime WebSocket Broadcast (<100ms push across all live phones & PCs)
  try {
    if (supabase) {
      const channel = supabase.channel(REMOTE_CHANNEL_NAME);
      await channel.subscribe();
      await channel.send({
        type: 'broadcast',
        event: 'FORCE_HARD_REFRESH',
        payload: { command: 'FORCE_HARD_REFRESH', timestamp, initiator: 'ADMIN' }
      });
      success = true;
    }
  } catch (wsErr) {
    console.warn('[RemoteControl] WebSocket broadcast warning:', wsErr);
  }

  // 3. Persistent Supabase DB write to candidate_stations (catches reconnecting / polling clients)
  try {
    if (supabase) {
      const { error } = await supabase.from('candidate_stations').upsert({
        id: 'axent_remote_command_refresh',
        lab_id: 'SYSTEM_COMMAND',
        station_number: 'REFRESH',
        status: 'COMMAND',
        code: JSON.stringify({ command: 'FORCE_HARD_REFRESH', timestamp }),
        student: { command: 'FORCE_HARD_REFRESH', timestamp },
        last_updated_timestamp: timestamp
      });
      if (!error) success = true;
    }
  } catch (dbErr) {
    console.warn('[RemoteControl] DB record upsert warning:', dbErr);
  }

  return success;
}

/**
 * Global listener initialized in App.tsx.
 * Listens for remote hard refresh broadcasts and postgres changes, then automatically triggers a hard reload.
 */
export function initRemoteHardRefreshListener(): () => void {
  if (typeof window === 'undefined') return () => {};

  const executeHardRefresh = (remoteTs: number) => {
    try {
      const lastProcessed = Number(localStorage.getItem(REMOTE_REFRESH_STORAGE_KEY) || '0');
      if (remoteTs <= lastProcessed) return;

      // Check if command is within the last 10 minutes (prevents infinite refresh from stale old commands)
      const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
      if (remoteTs < tenMinutesAgo) return;

      // Purge all candidate, exam, and attempt caches on this workstation
      try {
        localStorage.clear();
        sessionStorage.clear();
        localStorage.setItem(REMOTE_REFRESH_STORAGE_KEY, String(remoteTs));
      } catch {}

      console.warn('[RemoteControl] Remote wipe and refresh triggered by administrator. Reloading now...');

      // Cache-busting hard reload
      const cleanUrl = window.location.href.split('?')[0];
      const searchParams = new URLSearchParams(window.location.search);
      searchParams.set('_r', String(remoteTs));
      const targetUrl = cleanUrl + '?' + searchParams.toString();

      setTimeout(() => {
        try {
          window.location.replace(targetUrl);
        } catch {
          window.location.reload();
        }
      }, 250);
    } catch {
      window.location.reload();
    }
  };

  // 1. Supabase Realtime Channel
  let channel: any = null;
  try {
    if (supabase) {
      channel = supabase
        .channel(`axent_refresh_listener_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`)
        .on('broadcast', { event: 'FORCE_HARD_REFRESH' }, (msg: any) => {
          const ts = Number(msg?.payload?.timestamp);
          if (ts && ts > 0) {
            executeHardRefresh(ts);
          }
        })
        .subscribe();
    }
  } catch (e) {
    console.warn('[RemoteControl] Failed to subscribe to realtime refresh channel:', e);
  }

  // 2. Supabase Postgres changes on candidate_stations (axent_remote_command_refresh)
  let pgChannel: any = null;
  try {
    if (supabase) {
      pgChannel = supabase
        .channel(`axent_refresh_pg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'candidate_stations',
            filter: 'id=eq.axent_remote_command_refresh'
          },
          (payload: any) => {
            const newRow = payload?.new;
            const ts = Number(newRow?.last_updated_timestamp || (newRow?.student as any)?.timestamp);
            if (ts && ts > 0) {
              executeHardRefresh(ts);
            }
          }
        )
        .subscribe();
    }
  } catch (e) {
    console.warn('[RemoteControl] Failed to subscribe to pg changes:', e);
  }

  // 3. Periodic fallback poll every 8 seconds for devices with WebSocket restrictions
  const interval = setInterval(async () => {
    try {
      if (!supabase) return;
      const { data } = await supabase
        .from('candidate_stations')
        .select('last_updated_timestamp, student')
        .eq('id', 'axent_remote_command_refresh')
        .maybeSingle();

      if (data) {
        const ts = Number(data.last_updated_timestamp || (data.student as any)?.timestamp);
        if (ts && ts > 0) {
          executeHardRefresh(ts);
        }
      }
    } catch {}
  }, 8000);

  return () => {
    try {
      if (channel && supabase) supabase.removeChannel(channel);
      if (pgChannel && supabase) supabase.removeChannel(pgChannel);
      clearInterval(interval);
    } catch {}
  };
}
