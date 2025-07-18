'use client';

import { useCallback, useEffect, useRef } from 'react';
import { FixedContentCore, FixedContentActionType } from './components/fixedContentCore';
import clipboard from 'tauri-plugin-clipboard-api';
import { showWindow } from '@/utils/window';
import { getCurrentWindow, PhysicalPosition, PhysicalSize } from '@tauri-apps/api/window';
import { setDrawWindowStyle } from '@/commands/screenshot';
import { getCurrentMonitorInfo, readImageFromClipboard } from '@/commands/core';
import { scrollScreenshotClear, scrollScreenshotGetImageData } from '@/commands/scrollScreenshot';
import { convertFileSrc } from '@tauri-apps/api/core';

export default function FixedContentPage() {
    const fixedContentActionRef = useRef<FixedContentActionType>(undefined);

    const initedRef = useRef(false);

    const init = useCallback(async () => {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('scroll_screenshot') === 'true') {
            const imageBlob = await scrollScreenshotGetImageData();
            scrollScreenshotClear();
            if (imageBlob) {
                fixedContentActionRef.current?.init({ imageContent: imageBlob });
                return;
            }
        } else {
            try {
                const imageBlob = await readImageFromClipboard();
                if (imageBlob) {
                    fixedContentActionRef.current?.init({ imageContent: imageBlob });
                    return;
                }
            } catch {}

            try {
                const htmlContent = await clipboard.readHtml();
                if (htmlContent) {
                    fixedContentActionRef.current?.init({ htmlContent });
                    return;
                }
            } catch {}

            try {
                const textContent = await clipboard.readText();
                if (textContent) {
                    fixedContentActionRef.current?.init({ textContent });
                    return;
                }
            } catch {}

            try {
                const fileUris = await clipboard.readFilesURIs();
                let imageFileUri: string | undefined = undefined;
                for (const fileUri of fileUris) {
                    if (
                        fileUri.endsWith('.png') ||
                        fileUri.endsWith('.jpg') ||
                        fileUri.endsWith('.jpeg') ||
                        fileUri.endsWith('.webp') ||
                        fileUri.endsWith('.avif') ||
                        fileUri.endsWith('.gif')
                    ) {
                        imageFileUri = fileUri;
                        break;
                    }
                }

                if (imageFileUri) {
                    fixedContentActionRef.current?.init({
                        imageContent: convertFileSrc(imageFileUri),
                    });
                    return;
                }
            } catch {}
        }

        getCurrentWindow().close();
    }, []);

    useEffect(() => {
        if (initedRef.current) {
            return;
        }

        initedRef.current = true;

        init();
    }, [init]);

    const onHtmlTextImageLoad = useCallback(
        async (
            container: { width: number; height: number } | null | HTMLImageElement | HTMLDivElement,
        ) => {
            const appWindow = getCurrentWindow();

            if (!container) {
                return;
            }

            const monitorInfoPromise = getCurrentMonitorInfo();

            let width = 0;
            let height = 0;
            if ('width' in container && 'height' in container) {
                width = container.width;
                height = container.height;
            } else {
                width = container.clientWidth;
                height = container.clientHeight;
            }

            let scaleFactor = 1 / window.devicePixelRatio;
            if (container instanceof HTMLImageElement) {
                scaleFactor = container.naturalWidth / container.width;
            }

            if (width > 0 && height > 0) {
                const windowWidth = Math.floor(width / scaleFactor);
                const windowHeight = Math.floor(height / scaleFactor);
                const monitorInfo = await monitorInfoPromise;
                await Promise.all([
                    appWindow.setSize(new PhysicalSize(windowWidth, windowHeight)),
                    appWindow.setPosition(
                        new PhysicalPosition(
                            Math.round(
                                monitorInfo.monitor_x + monitorInfo.mouse_x - windowWidth / 2,
                            ),
                            Math.round(
                                monitorInfo.monitor_y + monitorInfo.mouse_y - windowHeight / 2,
                            ),
                        ),
                    ),
                ]);
                showWindow();
                setDrawWindowStyle();
            } else {
                await appWindow.close();
            }
        },
        [],
    );

    return (
        <div>
            <FixedContentCore
                actionRef={fixedContentActionRef}
                onHtmlLoad={onHtmlTextImageLoad}
                onTextLoad={onHtmlTextImageLoad}
                onImageLoad={onHtmlTextImageLoad}
            />
        </div>
    );
}
