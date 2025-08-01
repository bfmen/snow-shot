import { VideoRecordState } from '@/app/videoRecord/extra';
import { emit } from '@tauri-apps/api/event';

export type VideoRecordWindowInfo = {
    monitor_height: number;
    monitor_scale_factor: number;
    monitor_width: number;
    monitor_x: number;
    monitor_y: number;
    select_rect_max_x: number;
    select_rect_max_y: number;
    select_rect_min_x: number;
    select_rect_min_y: number;
};

export const closeVideoRecordWindow = async () => {
    await emit('close-video-record-window');
};

export const changeVideoRecordState = async (state: VideoRecordState) => {
    await emit('change-video-record-state', {
        state,
    });
};
