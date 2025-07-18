'use client';

import { GroupTitle } from '@/components/groupTitle';
import {
    Button,
    Col,
    Divider,
    Form,
    Row,
    Slider,
    Space,
    Spin,
    Switch,
    theme,
    Typography,
} from 'antd';
import {
    AppSettingsActionContext,
    AppSettingsData,
    AppSettingsGroup,
    clearAllConfig,
    getConfigDirPath,
} from '../../contextWrap';
import { useCallback, useContext, useEffect, useState } from 'react';
import { useAppSettingsLoad } from '@/hooks/useAppSettingsLoad';
import { FormattedMessage } from 'react-intl';
import { ContentWrap } from '@/components/contentWrap';
import { IconLabel } from '@/components/iconLable';
import { ResetSettingsButton } from '@/components/resetSettingsButton';
import ProForm, { ProFormSlider } from '@ant-design/pro-form';
import { openPath } from '@tauri-apps/plugin-opener';
import { AntdContext } from '@/components/globalLayoutExtra';
import { clearAllAppStore } from '@/utils/appStore';
import { relaunch } from '@tauri-apps/plugin-process';

export default function SystemSettings() {
    const { token } = theme.useToken();
    const { modal, message } = useContext(AntdContext);

    const { updateAppSettings } = useContext(AppSettingsActionContext);
    const [commonForm] = Form.useForm<AppSettingsData[AppSettingsGroup.SystemCommon]>();
    // const [renderForm] = Form.useForm<AppSettingsData[AppSettingsGroup.Render]>();
    const [scrollScreenshotForm] =
        Form.useForm<AppSettingsData[AppSettingsGroup.SystemScrollScreenshot]>();
    const [chatForm] = Form.useForm<AppSettingsData[AppSettingsGroup.SystemChat]>();
    const [networkForm] = Form.useForm<AppSettingsData[AppSettingsGroup.SystemNetwork]>();

    const [appSettingsLoading, setAppSettingsLoading] = useState(true);
    useAppSettingsLoad(
        useCallback(
            (settings: AppSettingsData, preSettings?: AppSettingsData) => {
                setAppSettingsLoading(false);

                // if (
                //     preSettings === undefined ||
                //     preSettings[AppSettingsGroup.Render] !== settings[AppSettingsGroup.Render]
                // ) {
                //     renderForm.setFieldsValue(settings[AppSettingsGroup.Render]);
                // }

                if (
                    preSettings === undefined ||
                    preSettings[AppSettingsGroup.SystemCommon] !==
                        settings[AppSettingsGroup.SystemCommon]
                ) {
                    commonForm.setFieldsValue(settings[AppSettingsGroup.SystemCommon]);
                }

                if (
                    preSettings === undefined ||
                    preSettings[AppSettingsGroup.SystemChat] !==
                        settings[AppSettingsGroup.SystemChat]
                ) {
                    chatForm.setFieldsValue(settings[AppSettingsGroup.SystemChat]);
                }

                if (
                    preSettings === undefined ||
                    preSettings[AppSettingsGroup.SystemNetwork] !==
                        settings[AppSettingsGroup.SystemNetwork]
                ) {
                    networkForm.setFieldsValue(settings[AppSettingsGroup.SystemNetwork]);
                }

                if (
                    preSettings === undefined ||
                    preSettings[AppSettingsGroup.SystemScrollScreenshot] !==
                        settings[AppSettingsGroup.SystemScrollScreenshot]
                ) {
                    scrollScreenshotForm.setFieldsValue(
                        settings[AppSettingsGroup.SystemScrollScreenshot],
                    );
                }
            },
            [commonForm, chatForm, networkForm, scrollScreenshotForm],
        ),
        true,
    );

    const [configDirPath, setConfigDirPath] = useState<string>('');
    useEffect(() => {
        getConfigDirPath().then((path) => {
            setConfigDirPath(path);
        });
    }, []);

    return (
        <ContentWrap>
            <GroupTitle
                id="commonSettings"
                extra={
                    <ResetSettingsButton
                        title={<FormattedMessage id="settings.systemSettings.commonSettings" />}
                        appSettingsGroup={AppSettingsGroup.SystemCommon}
                    />
                }
            >
                <FormattedMessage id="settings.systemSettings.commonSettings" />
            </GroupTitle>

            <Spin spinning={appSettingsLoading}>
                <ProForm
                    form={commonForm}
                    onValuesChange={(_, values) => {
                        updateAppSettings(
                            AppSettingsGroup.SystemCommon,
                            values,
                            true,
                            true,
                            false,
                            true,
                        );
                    }}
                    submitter={false}
                    layout="horizontal"
                >
                    <Row gutter={token.margin}>
                        <Col span={12}>
                            <ProForm.Item
                                label={
                                    <IconLabel
                                        label={
                                            <FormattedMessage id="settings.systemSettings.commonSettings.autoStart" />
                                        }
                                    />
                                }
                                name="autoStart"
                                valuePropName="checked"
                            >
                                <Switch />
                            </ProForm.Item>
                        </Col>
                        <Col span={12}>
                            <ProForm.Item
                                label={
                                    <IconLabel
                                        label={
                                            <FormattedMessage id="settings.systemSettings.commonSettings.autoCheckVersion" />
                                        }
                                    />
                                }
                                name="autoCheckVersion"
                                valuePropName="checked"
                            >
                                <Switch />
                            </ProForm.Item>
                        </Col>
                    </Row>
                </ProForm>
            </Spin>

            <Divider />

            {/* <GroupTitle
                id="renderSettings"
                extra={
                    <ResetSettingsButton
                        title={
                            <FormattedMessage id="settings.renderSettings" key="renderSettings" />
                        }
                        appSettingsGroup={AppSettingsGroup.Render}
                    />
                }
            >
                <FormattedMessage id="settings.renderSettings" />
            </GroupTitle>

            <Spin spinning={appSettingsLoading}>
                <ProForm
                    form={renderForm}
                    onValuesChange={(_, values) => {
                        updateAppSettings(AppSettingsGroup.Render, values, true, true, true);
                    }}
                    submitter={false}
                    layout="horizontal"
                >
                    <ProForm.Item
                        label={<IconLabel label={<FormattedMessage id="settings.antialias" />} />}
                        name="antialias"
                        valuePropName="checked"
                    >
                        <Switch />
                    </ProForm.Item>
                </ProForm>
            </Spin>

            <Divider /> */}

            <GroupTitle
                id="networkSettings"
                extra={
                    <ResetSettingsButton
                        title={<FormattedMessage id="settings.systemSettings.networkSettings" />}
                        appSettingsGroup={AppSettingsGroup.SystemNetwork}
                    />
                }
            >
                <FormattedMessage id="settings.systemSettings.networkSettings" />
            </GroupTitle>

            <Spin spinning={appSettingsLoading}>
                <ProForm
                    form={networkForm}
                    onValuesChange={(_, values) => {
                        updateAppSettings(
                            AppSettingsGroup.SystemNetwork,
                            values,
                            true,
                            true,
                            false,
                            true,
                        );
                    }}
                    submitter={false}
                    layout="horizontal"
                >
                    <ProForm.Item
                        label={
                            <IconLabel
                                label={
                                    <FormattedMessage id="settings.systemSettings.networkSettings.proxy" />
                                }
                            />
                        }
                        name="enableProxy"
                        valuePropName="checked"
                    >
                        <Switch />
                    </ProForm.Item>
                </ProForm>
            </Spin>

            <Divider />

            <GroupTitle
                id="scrollScreenshotSettings"
                extra={
                    <ResetSettingsButton
                        title={
                            <FormattedMessage id="settings.systemSettings.scrollScreenshotSettings" />
                        }
                        appSettingsGroup={AppSettingsGroup.SystemScrollScreenshot}
                    />
                }
            >
                <FormattedMessage id="settings.systemSettings.scrollScreenshotSettings" />
            </GroupTitle>

            <Spin spinning={appSettingsLoading}>
                <ProForm
                    form={scrollScreenshotForm}
                    onValuesChange={(_, values) => {
                        updateAppSettings(
                            AppSettingsGroup.SystemScrollScreenshot,
                            values,
                            true,
                            true,
                            true,
                            true,
                        );
                    }}
                    submitter={false}
                    layout="vertical"
                >
                    <Row gutter={token.margin}>
                        <Col span={12}>
                            <ProFormSlider
                                label={
                                    <IconLabel
                                        label={
                                            <FormattedMessage id="settings.systemSettings.scrollScreenshotSettings.imageFeatureThreshold" />
                                        }
                                        tooltipTitle={
                                            <FormattedMessage id="settings.systemSettings.scrollScreenshotSettings.imageFeatureThreshold.tip" />
                                        }
                                    />
                                }
                                name="imageFeatureThreshold"
                                min={0}
                                max={255}
                                step={1}
                                marks={{
                                    0: '0',
                                    255: '255',
                                }}
                            />
                        </Col>
                        <Col span={12}>
                            <ProFormSlider
                                label={
                                    <IconLabel
                                        label={
                                            <FormattedMessage id="settings.systemSettings.scrollScreenshotSettings.sampleRate" />
                                        }
                                        tooltipTitle={
                                            <FormattedMessage id="settings.systemSettings.scrollScreenshotSettings.sampleRate.tip" />
                                        }
                                    />
                                }
                                name="sampleRate"
                                min={0}
                                max={1}
                                step={0.1}
                                marks={{
                                    0: '0.1',
                                    1: '1',
                                }}
                            />
                        </Col>
                        <Col span={12}>
                            <ProFormSlider
                                label={
                                    <IconLabel
                                        label={
                                            <FormattedMessage id="settings.systemSettings.scrollScreenshotSettings.minSide" />
                                        }
                                        tooltipTitle={
                                            <FormattedMessage id="settings.systemSettings.scrollScreenshotSettings.minSide.tip" />
                                        }
                                    />
                                }
                                name="minSide"
                                min={64}
                                max={1024}
                                step={1}
                                marks={{
                                    64: '64',
                                    1024: '1024',
                                }}
                            />
                        </Col>
                        <Col span={12}>
                            <ProFormSlider
                                label={
                                    <IconLabel
                                        label={
                                            <FormattedMessage id="settings.systemSettings.scrollScreenshotSettings.maxSide" />
                                        }
                                        tooltipTitle={
                                            <FormattedMessage id="settings.systemSettings.scrollScreenshotSettings.maxSide.tip" />
                                        }
                                    />
                                }
                                name="maxSide"
                                min={64}
                                max={4096}
                                step={1}
                                marks={{
                                    64: '64',
                                    4096: '4096',
                                }}
                            />
                        </Col>
                        <Col span={12}>
                            <ProFormSlider
                                label={
                                    <IconLabel
                                        label={
                                            <FormattedMessage id="settings.systemSettings.scrollScreenshotSettings.imageFeatureDescriptionLength" />
                                        }
                                        tooltipTitle={
                                            <FormattedMessage id="settings.systemSettings.scrollScreenshotSettings.imageFeatureDescriptionLength.tip" />
                                        }
                                    />
                                }
                                name="imageFeatureDescriptionLength"
                                min={8}
                                max={128}
                                step={1}
                                marks={{
                                    8: '8',
                                    128: '128',
                                }}
                            />
                        </Col>
                    </Row>
                </ProForm>
            </Spin>

            <Divider />

            <GroupTitle
                id="chatSettings"
                extra={
                    <ResetSettingsButton
                        title={<FormattedMessage id="settings.chatSettings" key="chatSettings" />}
                        appSettingsGroup={AppSettingsGroup.SystemChat}
                    />
                }
            >
                <FormattedMessage id="settings.chatSettings" />
            </GroupTitle>

            <Spin spinning={appSettingsLoading}>
                <ProForm
                    form={chatForm}
                    onValuesChange={(_, values) => {
                        updateAppSettings(
                            AppSettingsGroup.SystemChat,
                            values,
                            true,
                            true,
                            false,
                            true,
                        );
                    }}
                    submitter={false}
                >
                    <ProForm.Item
                        key="maxTokens"
                        label={
                            <IconLabel
                                label={<FormattedMessage id="settings.chatSettings.maxTokens" />}
                                tooltipTitle={
                                    <FormattedMessage id="settings.chatSettings.maxTokens.tip" />
                                }
                            />
                        }
                        name="maxTokens"
                    >
                        <Slider
                            min={512}
                            max={8192}
                            step={128}
                            marks={{
                                512: '512',
                                4096: '4096',
                                8192: '8192',
                            }}
                        />
                    </ProForm.Item>

                    <ProFormSlider
                        key="temperature"
                        label={
                            <IconLabel
                                label={<FormattedMessage id="settings.chatSettings.temperature" />}
                                tooltipTitle={
                                    <FormattedMessage id="settings.chatSettings.temperature.tip" />
                                }
                            />
                        }
                        name="temperature"
                        min={0}
                        max={2}
                        step={0.1}
                        marks={{
                            0: '0',
                            1: '1',
                            2: '2',
                        }}
                    />

                    <ProFormSlider
                        key="thinkingBudgetTokens"
                        label={
                            <IconLabel
                                label={
                                    <FormattedMessage id="settings.chatSettings.thinkingBudgetTokens" />
                                }
                                tooltipTitle={
                                    <FormattedMessage id="settings.chatSettings.thinkingBudgetTokens.tip" />
                                }
                            />
                        }
                        name="thinkingBudgetTokens"
                        min={1024}
                        max={8192}
                        step={128}
                        marks={{
                            1024: '1024',
                            4096: '4096',
                            8192: '8192',
                        }}
                    />
                </ProForm>
            </Spin>

            <Divider />

            <GroupTitle id="dataFile">
                <FormattedMessage id="settings.systemSettings.dataFile" />
            </GroupTitle>

            <Spin spinning={!configDirPath}>
                <ProForm submitter={false} layout="horizontal">
                    <Row gutter={token.margin}>
                        <Col span={24}>
                            <ProForm.Item
                                label={
                                    <IconLabel
                                        label={
                                            <FormattedMessage id="settings.systemSettings.dataFilePath" />
                                        }
                                    />
                                }
                            >
                                <Space wrap>
                                    <Typography.Text
                                        copyable={{
                                            text: configDirPath,
                                        }}
                                    >
                                        {configDirPath}
                                    </Typography.Text>
                                    <Button
                                        onClick={async () => {
                                            try {
                                                await openPath(configDirPath);
                                            } catch {
                                                message.error(
                                                    <FormattedMessage id="settings.systemSettings.dataFilePath.open.failed" />,
                                                );
                                            }
                                        }}
                                    >
                                        <FormattedMessage id="settings.systemSettings.dataFilePath.open" />
                                    </Button>
                                </Space>
                            </ProForm.Item>
                        </Col>
                        <Col span={12}>
                            <ProForm.Item
                                label={
                                    <IconLabel
                                        label={
                                            <FormattedMessage id="settings.systemSettings.dataFile.clearAll" />
                                        }
                                    />
                                }
                            >
                                <Button
                                    type="primary"
                                    danger
                                    onClick={() => {
                                        modal.confirm({
                                            title: (
                                                <FormattedMessage id="settings.systemSettings.dataFile.clearAll.confirm" />
                                            ),
                                            type: 'error',
                                            onOk: async () => {
                                                await Promise.all([
                                                    clearAllAppStore(),
                                                    clearAllConfig(),
                                                ]);
                                                relaunch();
                                            },
                                        });
                                    }}
                                >
                                    <FormattedMessage id="settings.systemSettings.dataFile.clearAll" />
                                </Button>
                            </ProForm.Item>
                        </Col>
                    </Row>
                </ProForm>
            </Spin>
        </ContentWrap>
    );
}
