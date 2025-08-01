'use client';

import { zIndexs } from '@/utils/zIndex';
import { CaptureStep, DrawContext } from '../../types';
import { useCallback, useContext, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Flex, theme } from 'antd';
import React from 'react';
import { DragButton, DragButtonActionType } from './components/dragButton';
import { DrawToolbarContext } from './extra';
import { KeyEventKey } from './components/keyEventWrap/extra';
import { AppstoreOutlined, CloseOutlined, CopyOutlined, DragOutlined } from '@ant-design/icons';
import {
    ArrowIcon,
    ArrowSelectIcon,
    CircleIcon,
    EraserIcon,
    FastSaveIcon,
    FixedIcon,
    MosaicIcon,
    OcrDetectIcon,
    PenIcon,
    RectIcon,
    SaveIcon,
    ScrollScreenshotIcon,
    SerialNumberIcon,
    TextIcon,
} from '@/components/icons';
import {
    CaptureEvent,
    CaptureEventParams,
    CaptureEventPublisher,
    CaptureStepPublisher,
    DrawEvent,
    DrawEventParams,
    DrawEventPublisher,
    ScreenshotTypePublisher,
} from '../../extra';
import { useStateSubscriber } from '@/hooks/useStateSubscriber';
import { createPublisher } from '@/hooks/useStatePublisher';
import { EnableKeyEventPublisher } from './components/keyEventWrap/extra';
import { HistoryControls } from './components/historyControls';
import { ToolButton } from './components/toolButton';
import { FormattedMessage, useIntl } from 'react-intl';
import { BlurTool } from './components/tools/blurTool';
import { ScreenshotType } from '@/functions/screenshot';
import {
    ScrollScreenshot,
    ScrollScreenshotActionType,
} from './components/tools/scrollScreenshotTool';
import { AntdContext } from '@/components/globalLayoutExtra';
import { AppSettingsData, AppSettingsGroup, AppSettingsPublisher } from '@/app/contextWrap';
import { DrawSubTools } from './components/tools/drawSubTools';
import { debounce } from 'es-toolkit';
import { DrawState, DrawStatePublisher } from '@/app/fullScreenDraw/components/drawCore/extra';

export type DrawToolbarProps = {
    actionRef: React.RefObject<DrawToolbarActionType | undefined>;
    onCancel: () => void;
    onSave: (fastSave?: boolean) => void;
    onFixed: () => void;
    onTopWindow: () => void;
    onCopyToClipboard: () => void;
    onOcrDetect: () => void;
};

export type DrawToolbarActionType = {
    setEnable: (enable: boolean) => void;
};

export const DrawToolbarStatePublisher = createPublisher<{
    mouseHover: boolean;
}>({
    mouseHover: false,
});

const DrawToolbarCore: React.FC<DrawToolbarProps> = ({
    actionRef,
    onCancel,
    onSave,
    onFixed,
    onCopyToClipboard,
    onTopWindow,
    onOcrDetect,
}) => {
    const { drawCacheLayerActionRef, selectLayerActionRef } = useContext(DrawContext);

    const [getDrawToolbarState, setDrawToolbarState] = useStateSubscriber(
        DrawToolbarStatePublisher,
        undefined,
    );
    const [getDrawState, setDrawState] = useStateSubscriber(DrawStatePublisher, undefined);
    const [, setCaptureStep] = useStateSubscriber(CaptureStepPublisher, undefined);
    const [getScreenshotType] = useStateSubscriber(ScreenshotTypePublisher, undefined);
    const { token } = theme.useToken();
    const { message } = useContext(AntdContext);
    const intl = useIntl();

    const enableRef = useRef(false);
    const [enableFastSave, setEnableFastSave] = useState(false);
    const [enableScrollScreenshot, setEnableScrollScreenshot] = useState(false);
    const [shortcutCanleTip, setShortcutCanleTip] = useState(false);
    const drawToolarContainerRef = useRef<HTMLDivElement | null>(null);
    const drawToolbarOpacityWrapRef = useRef<HTMLDivElement | null>(null);
    const scrollScreenshotToolActionRef = useRef<ScrollScreenshotActionType | undefined>(undefined);
    const drawToolbarRef = useRef<HTMLDivElement | null>(null);
    const dragButtonActionRef = useRef<DragButtonActionType | undefined>(undefined);
    const [, setEnableKeyEvent] = useStateSubscriber(EnableKeyEventPublisher, undefined);
    useStateSubscriber(
        AppSettingsPublisher,
        useCallback((settings: AppSettingsData) => {
            setShortcutCanleTip(settings[AppSettingsGroup.FunctionScreenshot].shortcutCanleTip);
            setEnableFastSave(
                settings[AppSettingsGroup.FunctionScreenshot].enhanceSaveFile &&
                    settings[AppSettingsGroup.FunctionScreenshot].fastSave,
            );
        }, []),
    );
    const draggingRef = useRef(false);

    const updateEnableKeyEvent = useCallback(() => {
        setEnableKeyEvent(enableRef.current && !draggingRef.current);
    }, [setEnableKeyEvent]);

    const onDraggingChange = useCallback(
        (dragging: boolean) => {
            draggingRef.current = dragging;
            updateEnableKeyEvent();
        },
        [updateEnableKeyEvent],
    );

    const setDragging = useCallback(
        (dragging: boolean) => {
            if (draggingRef.current === dragging) {
                return;
            }

            onDraggingChange(dragging);
        },
        [onDraggingChange],
    );

    const onToolClick = useCallback(
        (drawState: DrawState) => {
            const prev = getDrawState();

            if (drawState === DrawState.ScrollScreenshot) {
                const selectRect = selectLayerActionRef.current?.getSelectRect();

                if (!selectRect) {
                    message.error(intl.formatMessage({ id: 'draw.scrollScreenshot.limitTip' }));
                    return;
                }

                const minSize = Math.min(
                    selectRect.max_x - selectRect.min_x,
                    selectRect.max_y - selectRect.min_y,
                );
                if (minSize < 200) {
                    message.error(intl.formatMessage({ id: 'draw.scrollScreenshot.limitTip' }));
                    return;
                } else if (minSize < 300) {
                    message.warning(
                        intl.formatMessage({ id: 'draw.scrollScreenshot.limitTip.warning' }),
                    );
                }
            }

            let next = drawState;
            if (prev === drawState && prev !== DrawState.Idle) {
                if (drawState === DrawState.ScrollScreenshot) {
                    next = DrawState.Idle;
                } else {
                    next = DrawState.Select;
                }
            }

            if (next !== DrawState.Idle) {
                setCaptureStep(CaptureStep.Draw);
            } else {
                setCaptureStep(CaptureStep.Select);
            }

            switch (next) {
                case DrawState.Idle:
                    drawCacheLayerActionRef.current?.setEnable(false);
                    drawCacheLayerActionRef.current?.setActiveTool({
                        type: 'hand',
                    });
                    break;
                case DrawState.Select:
                    drawCacheLayerActionRef.current?.setEnable(true);
                    drawCacheLayerActionRef.current?.setActiveTool({
                        type: 'selection',
                    });
                    break;
                case DrawState.Rect:
                    drawCacheLayerActionRef.current?.setEnable(true);
                    drawCacheLayerActionRef.current?.setActiveTool({
                        type: 'rectangle',
                        locked: true,
                    });
                    break;
                case DrawState.Diamond:
                    drawCacheLayerActionRef.current?.setEnable(true);
                    drawCacheLayerActionRef.current?.setActiveTool({
                        type: 'diamond',
                        locked: true,
                    });
                    break;
                case DrawState.Ellipse:
                    drawCacheLayerActionRef.current?.setEnable(true);
                    drawCacheLayerActionRef.current?.setActiveTool({
                        type: 'ellipse',
                        locked: true,
                    });
                    break;
                case DrawState.Arrow:
                    drawCacheLayerActionRef.current?.setEnable(true);
                    drawCacheLayerActionRef.current?.setActiveTool({
                        type: 'arrow',
                        locked: true,
                    });
                    break;
                case DrawState.Line:
                    drawCacheLayerActionRef.current?.setEnable(true);
                    drawCacheLayerActionRef.current?.setActiveTool({
                        type: 'line',
                        locked: true,
                    });
                    break;
                case DrawState.Pen:
                    drawCacheLayerActionRef.current?.setEnable(true);
                    drawCacheLayerActionRef.current?.setActiveTool({
                        type: 'freedraw',
                        locked: true,
                    });
                    break;
                case DrawState.Text:
                    drawCacheLayerActionRef.current?.setEnable(true);
                    drawCacheLayerActionRef.current?.setActiveTool({
                        type: 'text',
                        locked: true,
                    });
                    break;
                case DrawState.SerialNumber:
                    drawCacheLayerActionRef.current?.setEnable(true);
                    break;
                case DrawState.Blur:
                    drawCacheLayerActionRef.current?.setEnable(true);
                    drawCacheLayerActionRef.current?.setActiveTool({
                        type: 'blur',
                        locked: true,
                    });
                    break;
                case DrawState.Eraser:
                    drawCacheLayerActionRef.current?.setEnable(true);
                    drawCacheLayerActionRef.current?.setActiveTool({
                        type: 'eraser',
                        locked: true,
                    });
                    break;
                case DrawState.OcrDetect:
                    drawCacheLayerActionRef.current?.setEnable(false);
                    drawCacheLayerActionRef.current?.setActiveTool({
                        type: 'hand',
                    });
                    onOcrDetect();
                    break;
                case DrawState.ExtraTools:
                    drawCacheLayerActionRef.current?.setEnable(false);
                    drawCacheLayerActionRef.current?.setActiveTool({
                        type: 'hand',
                    });
                    break;
                default:
                    break;
            }

            if (next === DrawState.ScrollScreenshot) {
                setEnableScrollScreenshot(true);
            } else {
                setEnableScrollScreenshot(false);
            }

            setDrawState(next);
        },
        [
            drawCacheLayerActionRef,
            getDrawState,
            intl,
            message,
            onOcrDetect,
            selectLayerActionRef,
            setCaptureStep,
            setDrawState,
        ],
    );

    const drawToolbarContextValue = useMemo(() => {
        return {
            drawToolbarRef,
            draggingRef,
            setDragging,
        };
    }, [drawToolbarRef, draggingRef, setDragging]);

    const canHandleScreenshotTypeRef = useRef(false);
    useStateSubscriber(
        CaptureEventPublisher,
        useCallback((event: CaptureEventParams | undefined) => {
            if (!event) {
                return;
            }

            if (event.event === CaptureEvent.onCaptureReady) {
                canHandleScreenshotTypeRef.current = true;
            }
        }, []),
    );

    const showDrawToolbarContainer = useCallback(() => {
        if (drawToolbarOpacityWrapRef.current) {
            drawToolbarOpacityWrapRef.current.style.transition = `opacity ${token.motionDurationMid} ${token.motionEaseInOut}`;
            drawToolbarOpacityWrapRef.current.style.opacity = '1';
        }

        const subToolContainer =
            scrollScreenshotToolActionRef.current?.getScrollScreenshotSubToolContainer();

        if (subToolContainer) {
            subToolContainer.style.transition = `opacity ${token.motionDurationMid} ${token.motionEaseInOut}`;
            subToolContainer.style.opacity = '1';
        }
    }, [token.motionDurationMid, token.motionEaseInOut]);
    const showDrawToolbarContainerDebounce = useMemo(
        () => debounce(showDrawToolbarContainer, 512),
        [showDrawToolbarContainer],
    );

    const onEnableChange = useCallback(
        (enable: boolean) => {
            enableRef.current = enable;
            dragButtonActionRef.current?.setEnable(enable);

            if (canHandleScreenshotTypeRef.current) {
                switch (getScreenshotType()) {
                    case ScreenshotType.Fixed:
                        onFixed();
                        break;
                    case ScreenshotType.OcrDetect:
                        onToolClick(DrawState.OcrDetect);
                        break;
                    case ScreenshotType.TopWindow:
                        onTopWindow();
                        break;
                    case ScreenshotType.Default:
                    default:
                        onToolClick(DrawState.Idle);
                        break;
                }
                canHandleScreenshotTypeRef.current = false;
            }

            // 重置下工具栏样式，防止滚动截图时直接结束截图
            if (enable) {
                showDrawToolbarContainerDebounce();
            }
        },
        [getScreenshotType, onFixed, onToolClick, onTopWindow, showDrawToolbarContainerDebounce],
    );

    const setEnable = useCallback(
        (enable: boolean) => {
            if (enableRef.current === enable) {
                return;
            }

            onEnableChange(enable);
            updateEnableKeyEvent();
        },
        [onEnableChange, updateEnableKeyEvent],
    );

    useImperativeHandle(actionRef, () => {
        return {
            setEnable,
        };
    }, [setEnable]);

    const disableNormalScreenshotTool = enableScrollScreenshot;

    useStateSubscriber(
        DrawEventPublisher,
        useCallback(
            (event: DrawEventParams | undefined) => {
                const subToolContainer =
                    scrollScreenshotToolActionRef.current?.getScrollScreenshotSubToolContainer();
                if (!drawToolbarOpacityWrapRef.current || !subToolContainer) {
                    return;
                }

                if (event?.event === DrawEvent.ScrollScreenshot) {
                    subToolContainer.style.transition = 'unset';
                    subToolContainer.style.opacity = '0';
                    drawToolbarOpacityWrapRef.current.style.transition =
                        subToolContainer.style.transition;
                    drawToolbarOpacityWrapRef.current.style.opacity =
                        subToolContainer.style.opacity;
                    showDrawToolbarContainerDebounce();
                }
            },
            [showDrawToolbarContainerDebounce],
        ),
    );

    return (
        <div
            className="draw-toolbar-container"
            onMouseDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
            }}
            ref={drawToolarContainerRef}
        >
            <DrawToolbarContext.Provider value={drawToolbarContextValue}>
                <div ref={drawToolbarOpacityWrapRef}>
                    <DrawSubTools onToolClick={onToolClick} />

                    <div
                        onMouseEnter={() => {
                            setDrawToolbarState({ ...getDrawToolbarState(), mouseHover: true });
                        }}
                        onMouseLeave={() => {
                            setDrawToolbarState({ ...getDrawToolbarState(), mouseHover: false });
                        }}
                        className="draw-toolbar"
                        onDoubleClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                        }}
                        ref={drawToolbarRef}
                    >
                        <Flex align="center" gap={token.paddingXS}>
                            <DragButton actionRef={dragButtonActionRef} />

                            {/* 默认状态 */}
                            <ToolButton
                                componentKey={KeyEventKey.MoveTool}
                                icon={<DragOutlined />}
                                drawState={DrawState.Idle}
                                onClick={() => {
                                    onToolClick(DrawState.Idle);
                                }}
                            />

                            {/* 选择状态 */}
                            <ToolButton
                                componentKey={KeyEventKey.SelectTool}
                                icon={<ArrowSelectIcon style={{ fontSize: '1.08em' }} />}
                                drawState={DrawState.Select}
                                disable={disableNormalScreenshotTool}
                                onClick={() => {
                                    onToolClick(DrawState.Select);
                                }}
                            />

                            <div className="draw-toolbar-splitter" />

                            {/* 矩形 */}
                            <ToolButton
                                componentKey={KeyEventKey.RectTool}
                                icon={<RectIcon style={{ fontSize: '1em' }} />}
                                disable={disableNormalScreenshotTool}
                                extraDrawState={[DrawState.Diamond]}
                                drawState={DrawState.Rect}
                                onClick={() => {
                                    onToolClick(DrawState.Rect);
                                }}
                            />

                            {/* 椭圆 */}
                            <ToolButton
                                componentKey={KeyEventKey.EllipseTool}
                                icon={<CircleIcon style={{ fontSize: '1em' }} />}
                                drawState={DrawState.Ellipse}
                                disable={disableNormalScreenshotTool}
                                onClick={() => {
                                    onToolClick(DrawState.Ellipse);
                                }}
                            />

                            {/* 箭头 */}
                            <ToolButton
                                componentKey={KeyEventKey.ArrowTool}
                                icon={<ArrowIcon style={{ fontSize: '0.83em' }} />}
                                drawState={DrawState.Arrow}
                                extraDrawState={[DrawState.Line]}
                                disable={disableNormalScreenshotTool}
                                onClick={() => {
                                    onToolClick(DrawState.Arrow);
                                }}
                            />

                            {/* 画笔 */}
                            <ToolButton
                                componentKey={KeyEventKey.PenTool}
                                icon={<PenIcon style={{ fontSize: '1.08em' }} />}
                                drawState={DrawState.Pen}
                                disable={disableNormalScreenshotTool}
                                onClick={() => {
                                    onToolClick(DrawState.Pen);
                                }}
                            />

                            {/* 文本 */}
                            <ToolButton
                                componentKey={KeyEventKey.TextTool}
                                icon={<TextIcon style={{ fontSize: '1.08em' }} />}
                                drawState={DrawState.Text}
                                disable={disableNormalScreenshotTool}
                                onClick={() => {
                                    onToolClick(DrawState.Text);
                                }}
                            />

                            {/* 序列号 */}
                            <ToolButton
                                componentKey={KeyEventKey.SerialNumberTool}
                                icon={<SerialNumberIcon style={{ fontSize: '1.16em' }} />}
                                drawState={DrawState.SerialNumber}
                                disable={disableNormalScreenshotTool}
                                onClick={() => {
                                    onToolClick(DrawState.SerialNumber);
                                }}
                            />

                            {/* 模糊 */}
                            <ToolButton
                                componentKey={KeyEventKey.BlurTool}
                                icon={<MosaicIcon />}
                                drawState={DrawState.Blur}
                                disable={disableNormalScreenshotTool}
                                onClick={() => {
                                    onToolClick(DrawState.Blur);
                                }}
                            />

                            {/* 橡皮擦 */}
                            <ToolButton
                                componentKey={KeyEventKey.EraserTool}
                                icon={<EraserIcon style={{ fontSize: '0.9em' }} />}
                                drawState={DrawState.Eraser}
                                disable={disableNormalScreenshotTool}
                                onClick={() => {
                                    onToolClick(DrawState.Eraser);
                                }}
                            />

                            <div className="draw-toolbar-splitter" />

                            <HistoryControls disable={enableScrollScreenshot} />

                            <div className="draw-toolbar-splitter" />

                            {/* 额外工具 */}
                            <ToolButton
                                componentKey={KeyEventKey.ExtraToolsTool}
                                icon={<AppstoreOutlined />}
                                drawState={DrawState.ExtraTools}
                                extraDrawState={[DrawState.ScanQrcode]}
                                disable={enableScrollScreenshot}
                                onClick={() => {
                                    onToolClick(DrawState.ExtraTools);
                                }}
                            />

                            {/* 固定到屏幕 */}
                            <ToolButton
                                componentKey={KeyEventKey.FixedTool}
                                icon={<FixedIcon style={{ fontSize: '1.1em' }} />}
                                drawState={DrawState.Fixed}
                                onClick={() => {
                                    onFixed();
                                }}
                            />

                            {/* OCR */}
                            <ToolButton
                                componentKey={KeyEventKey.OcrDetectTool}
                                icon={<OcrDetectIcon style={{ fontSize: '0.88em' }} />}
                                drawState={DrawState.OcrDetect}
                                disable={disableNormalScreenshotTool}
                                onClick={() => {
                                    onToolClick(DrawState.OcrDetect);
                                }}
                            />

                            {/* 滚动截图 */}
                            <ToolButton
                                componentKey={KeyEventKey.ScrollScreenshotTool}
                                icon={
                                    <div style={{ position: 'relative', top: '0.11em' }}>
                                        <ScrollScreenshotIcon style={{ fontSize: '1.2em' }} />
                                    </div>
                                }
                                drawState={DrawState.ScrollScreenshot}
                                onClick={() => {
                                    onToolClick(DrawState.ScrollScreenshot);
                                }}
                            />

                            {/* 快速保存截图 */}
                            {enableFastSave && (
                                <ToolButton
                                    componentKey={KeyEventKey.FastSaveTool}
                                    icon={<FastSaveIcon style={{ fontSize: '1.08em' }} />}
                                    drawState={DrawState.FastSave}
                                    onClick={() => {
                                        onSave(true);
                                    }}
                                />
                            )}

                            {/* 保存截图 */}
                            <ToolButton
                                componentKey={KeyEventKey.SaveTool}
                                icon={<SaveIcon style={{ fontSize: '1em' }} />}
                                drawState={DrawState.Save}
                                onClick={() => {
                                    onSave();
                                }}
                            />

                            <div className="draw-toolbar-splitter" />

                            {/* 取消截图 */}
                            <ToolButton
                                componentKey={KeyEventKey.CancelTool}
                                icon={
                                    <CloseOutlined
                                        style={{ fontSize: '0.83em', color: token.colorError }}
                                    />
                                }
                                confirmTip={
                                    shortcutCanleTip ? (
                                        <FormattedMessage id="draw.cancel.tip1" />
                                    ) : undefined
                                }
                                drawState={DrawState.Cancel}
                                onClick={() => {
                                    onCancel();
                                }}
                            />

                            {/* 复制截图 */}
                            <ToolButton
                                componentKey={KeyEventKey.CopyTool}
                                icon={
                                    <CopyOutlined
                                        style={{ fontSize: '0.92em', color: token.colorPrimary }}
                                    />
                                }
                                drawState={DrawState.Copy}
                                onClick={() => {
                                    onCopyToClipboard();
                                }}
                            />
                        </Flex>
                    </div>
                </div>

                <BlurTool />
                <ScrollScreenshot actionRef={scrollScreenshotToolActionRef} />
            </DrawToolbarContext.Provider>
            <style jsx>{`
                .draw-toolbar-container {
                    pointer-events: none;
                    user-select: none;
                    position: absolute;
                    z-index: ${zIndexs.Draw_Toolbar};
                    top: 0;
                    left: 0;
                    transition: opacity ${token.motionDurationFast} ${token.motionEaseInOut};
                }

                .draw-toolbar-container:hover {
                    z-index: ${zIndexs.Draw_ToolbarHover};
                }

                .draw-toolbar {
                    position: absolute;
                    opacity: 0;
                }

                .draw-toolbar {
                    padding: ${token.paddingXXS}px ${token.paddingSM}px;
                    box-sizing: border-box;
                    background-color: ${token.colorBgContainer};
                    border-radius: ${token.borderRadiusLG}px;
                    cursor: default; /* 防止非拖动区域也变成可拖动状态 */
                    color: ${token.colorText};
                    box-shadow: 0 0 3px 0px ${token.colorPrimaryHover};
                    transition: opacity ${token.motionDurationMid} ${token.motionEaseInOut};
                    z-index: ${zIndexs.Draw_Toolbar};
                }

                .draw-subtoolbar {
                    opacity: 0;
                }

                .draw-subtoolbar-container {
                    position: absolute;
                    right: 0;
                    bottom: calc(-100% - ${token.marginXXS}px);
                    height: 100%;
                }

                :global(.drag-button) {
                    color: ${token.colorTextQuaternary};
                    cursor: move;
                }

                .draw-toolbar :global(.draw-toolbar-drag) {
                    font-size: 18px;
                    margin-right: -3px;
                    margin-left: -3px;
                }

                .draw-toolbar-container :global(.ant-btn) :global(.ant-btn-icon) {
                    font-size: 24px;
                }

                .draw-toolbar-container :global(.ant-btn-icon) {
                    display: flex;
                    align-items: center;
                }

                .draw-toolbar-container :global(.draw-toolbar-splitter),
                .draw-toolbar-splitter {
                    width: 1px;
                    height: 0.83em;
                    background-color: ${token.colorBorder};
                    margin: 0 ${token.marginXXS}px;
                }
            `}</style>
        </div>
    );
};

export const DrawToolbar = React.memo(DrawToolbarCore);
