'use client';

import { AntdContext } from '@/components/globalLayoutExtra';
import { BotIcon, SidebarIcon } from '@/components/icons';
import { useStateRef } from '@/hooks/useStateRef';
import { ChatHistoryStore } from '@/utils/appStore';
import { CopyOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import {
    Bubble,
    Conversations,
    Sender,
    Suggestion,
    useXAgent,
    useXChat,
    Welcome,
    XRequest,
} from '@ant-design/x';
import type { BubbleDataType as AntdBubbleDataType } from '@ant-design/x/es/bubble/BubbleList';
import type { Conversation } from '@ant-design/x/es/conversations';
import { MessageInfo } from '@ant-design/x/es/use-x-chat';
import { Button, Card, Drawer, Select, Space, Spin, theme, Typography } from 'antd';
import dayjs from 'dayjs';
import { debounce, last, throttle } from 'es-toolkit';
import React, {
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    Suspense,
} from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import RSC, { Scrollbar } from 'react-scrollbars-custom';
import { appFetch, getUrl, ServiceResponse } from '@/services/tools';
import { ChatModel, getChatModels } from '@/services/tools/chat';
import {
    AppSettingsActionContext,
    AppSettingsData,
    AppSettingsGroup,
    AppSettingsPublisher,
} from '@/app/contextWrap';
import Markdown, { ExtraProps } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useSearchParams } from 'next/navigation';
import { finishScreenshot } from '@/functions/screenshot';
import { SenderRef } from '@ant-design/x/es/sender';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight, oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useStateSubscriber } from '@/hooks/useStateSubscriber';
import { copyText, copyTextAndHide, decodeParamsValue } from '@/utils';
import { HotkeysMenu } from '@/components/hotkeysMenu';
import { KeyEventValue } from '@/core/hotKeys';
import { KeyEventKey } from '@/core/hotKeys';
import { useAppSettingsLoad } from '@/hooks/useAppSettingsLoad';
import { useHotkeys } from 'react-hotkeys-hook';
import { SendQueueMessageList } from './components/sendQueueMessageList';
import { ChatMessage, ChatMessageFlowConfig, SendQueueMessage } from './types';
import { WorkflowList } from './components/workflowList';
import { ChatApiConfig } from '@/app/settings/functionSettings/extra';
import path from 'path';
import { ModelSelectLabel } from './components/modelSelectLabel';
import { openUrl } from '@tauri-apps/plugin-opener';

type BubbleDataType = AntdBubbleDataType & {
    flow_config?: ChatMessageFlowConfig;
};

const getMessageContent = (msg: ChatMessage | BubbleDataType, ignoreReasoningContent = false) => {
    const message = msg as ChatMessage;

    const content =
        typeof message.content === 'string'
            ? message.content
            : `${
                  !ignoreReasoningContent && message.content.reasoning_content
                      ? `${message.content.reasoning_content
                            .split('\n')
                            .map((line) => {
                                return `> ${line}`;
                            })
                            .join('\n')}\n\n`
                      : ''
              }${message.content.content}`;

    return content;
};

const CodeCard: React.FC<{
    props: React.ClassAttributes<HTMLElement> & React.HTMLAttributes<HTMLElement> & ExtraProps;
    language: string;
    darkMode: boolean;
}> = ({ props, language, darkMode }) => {
    const { children, ...rest } = props;
    return (
        <Card
            title={language}
            size="small"
            styles={{ body: { padding: 0, margin: '-0.5em 0' } }}
            extra={
                <Space>
                    <Button
                        type="text"
                        icon={<CopyOutlined />}
                        onClick={() => {
                            copyText(String(children).replace(/\n$/, ''));
                        }}
                    />
                </Space>
            }
        >
            <SyntaxHighlighter
                {...rest}
                ref={undefined}
                PreTag="div"
                language={language}
                style={darkMode ? oneDark : oneLight}
                wrapLongLines
                showLineNumbers
            >
                {String(children).replace(/\n$/, '')}
            </SyntaxHighlighter>
        </Card>
    );
};

const MarkdownContent: React.FC<{
    content: string;
    clipboardContent: string;
    darkMode: boolean;
}> = ({ content, darkMode }) => {
    return (
        <Typography>
            <Markdown
                components={{
                    code(props) {
                        const { children, className, ...rest } = props;
                        const match = /language-(\w+)/.exec(className || '');
                        return match ? (
                            <CodeCard language={match[1]} darkMode={darkMode} props={props} />
                        ) : (
                            <code {...rest} className={className}>
                                {children}
                            </code>
                        );
                    },
                    a: (props) => {
                        return (
                            <a
                                {...props}
                                onClick={(e) => {
                                    e.preventDefault();
                                    if (props.href) {
                                        openUrl(props.href);
                                    }
                                }}
                            />
                        );
                    },
                }}
                remarkPlugins={[remarkGfm]}
            >
                {content}
            </Markdown>

            <style jsx>{`
                :global(.ant-typography pre) {
                    background-color: transparent;
                    padding: 0;
                }

                :global(.ant-typography pre > div) {
                    margin: 0 !important;
                }
            `}</style>
        </Typography>
    );
};

const modelRequest = XRequest({
    baseURL: getUrl('/api/v1/chat/chat/completions'),
    fetch: appFetch,
});

type ChatModelConfig = ChatModel & {
    customConfig?: ChatApiConfig;
};

const defaultModel = 'deepseek-reasoner';
const defaultModles: ChatModelConfig[] = [
    {
        model: 'deepseek-chat',
        name: 'DeepSeek-V3',
        thinking: false,
    },
    {
        model: 'deepseek-reasoner',
        name: 'DeepSeek-R1',
        thinking: true,
    },
];

const fliterErrorMessages = (messages: BubbleDataType[] | undefined) => {
    if (!messages) {
        return [];
    }

    const newMessages = [];
    for (let i = 0; i < messages.length; i += 2) {
        const userMessage = messages[i];
        const assistantMessage = messages[i + 1];

        if (!userMessage) {
            break;
        }

        if (!assistantMessage) {
            newMessages.push(userMessage);
            continue;
        }

        if (
            assistantMessage.content &&
            typeof assistantMessage.content === 'object' &&
            'response_error' in assistantMessage.content &&
            assistantMessage.content.response_error
        ) {
            continue;
        }

        newMessages.push(userMessage);
        newMessages.push(assistantMessage);
    }

    const finalMessages = [];
    let lastRole: string | undefined = undefined;
    let consecutiveCount = 0;

    for (let i = 0; i < newMessages.length; i++) {
        const currentMessage = newMessages[i];

        if (currentMessage.role === lastRole) {
            consecutiveCount++;
            if (consecutiveCount >= 2) {
                finalMessages[finalMessages.length - 1] = currentMessage;
            } else {
                finalMessages.push(currentMessage);
            }
        } else {
            consecutiveCount = 1;
            lastRole = currentMessage.role;
            finalMessages.push(currentMessage);
        }
    }

    return finalMessages;
};

const CUSTOM_MODEL_PREFIX = 'snow_shot_custom_';

const Chat = () => {
    const intl = useIntl();

    const [hotKeys, setHotKeys] = useState<Record<KeyEventKey, KeyEventValue>>();
    useAppSettingsLoad(
        useCallback((appSettings) => {
            setHotKeys(appSettings[AppSettingsGroup.KeyEvent]);
        }, []),
        true,
    );

    const { token } = theme.useToken();
    const { message, modal } = useContext(AntdContext);
    const chatHistoryStoreRef = useRef<ChatHistoryStore | undefined>(undefined);
    const [sessionStoreLoading, setSessionStoreLoading] = useState(true);
    const [customModelConfigList, setCustomModelConfigList] = useState<ChatApiConfig[]>([]);
    const [onlineModelConfigList, setOnlineModelConfigList] = useState<ChatModel[]>([]);
    const [supportedModels, setSupportedModels, supportedModelsRef] =
        useStateRef<ChatModelConfig[]>(defaultModles);
    const [selectedModel, setSelectedModel, selectedModelRef] = useStateRef<string>(defaultModel);
    const [sendQueueMessages, setSendQueueMessages, sendQueueMessagesRef] = useStateRef<
        SendQueueMessage[]
    >([]);

    const { updateAppSettings } = useContext(AppSettingsActionContext);
    const [darkMode, setDarkMode] = useState(false);
    const [getAppSettings] = useStateSubscriber(
        AppSettingsPublisher,
        useCallback(
            (settings: AppSettingsData) => {
                setSelectedModel(settings[AppSettingsGroup.Cache].chatModel);
                setDarkMode(settings[AppSettingsGroup.Common].darkMode);
                setCustomModelConfigList(settings[AppSettingsGroup.FunctionChat].chatApiConfigList);
            },
            [setSelectedModel],
        ),
    );

    const [supportedModelsLoading, setSupportedModelsLoading, supportedModelsLoadingRef] =
        useStateRef(false);
    useEffect(() => {
        if (supportedModelsLoadingRef.current) {
            return;
        }

        setSupportedModelsLoading(true);
        getChatModels().then((res) => {
            setSupportedModelsLoading(false);
            if (!res.success()) {
                return;
            }

            setOnlineModelConfigList(res.data ?? defaultModles);
        });
    }, [getAppSettings, setSupportedModels, setSupportedModelsLoading, supportedModelsLoadingRef]);

    useEffect(() => {
        setSupportedModels([
            ...customModelConfigList.map((item) => {
                return {
                    model: `${CUSTOM_MODEL_PREFIX}${item.api_model}${item.support_thinking ? '_thinking' : ''}`,
                    name: item.model_name,
                    thinking: item.support_thinking,
                    customConfig: item,
                };
            }),
            ...onlineModelConfigList,
        ]);
    }, [getAppSettings, onlineModelConfigList, setSupportedModels, customModelConfigList]);

    const abortController = useRef<AbortController>(null);

    const [messageHistory, setMessageHistory, messageHistoryRef] = useStateRef<
        Record<string, MessageInfo<BubbleDataType>[]>
    >({});

    const [sessionList, setSessionList, sessionListRef] = useStateRef<
        (Conversation & { isDefaultSession: boolean })[]
    >([]);
    const [curSession, setCurSession, curSessionRef] = useStateRef<string | undefined>(undefined);

    const [inputValue, setInputValue] = useState('');
    const senderRef = useRef<SenderRef>(null);

    const getCustomModelRequest = useCallback(
        (model: string) => {
            if (!model.startsWith(CUSTOM_MODEL_PREFIX)) {
                return undefined;
            }

            const customConfig = supportedModelsRef.current.find(
                (item) => item.model === model,
            )?.customConfig;

            if (!customConfig) {
                return undefined;
            }

            return {
                request: XRequest({
                    baseURL: path.join(customConfig.api_uri, '/chat/completions'),
                    dangerouslyApiKey: `Bearer ${customConfig.api_key}`,
                    fetch: appFetch,
                }),
                config: customConfig,
            };
        },
        [supportedModelsRef],
    );
    const modelAgentConfig: Parameters<typeof useXAgent<BubbleDataType>>[0] = useMemo(() => {
        return {
            request: (input, callbacks) => {
                const inputMessages = input.messages?.slice(-20);
                let newInputMessages = fliterErrorMessages(inputMessages);

                // 处理消息变量
                const variables: Map<string, string> = new Map();
                // 遍历消息，如果用户消息指定了变量，那么将对应的输出变量添加到变量列表中
                for (let i = 0; i < newInputMessages.length; i++) {
                    const message = newInputMessages[i];
                    if (message.role === 'user' && 'flow_config' in message) {
                        const flowConfig = message.flow_config as ChatMessageFlowConfig;
                        if (!flowConfig) {
                            continue;
                        }

                        if (flowConfig.globalVariable) {
                            flowConfig.globalVariable.forEach((value, key) => {
                                variables.set(key, value);
                            });
                        }

                        if (flowConfig.flow.variable_name && newInputMessages[i + 1]) {
                            variables.set(
                                `{{${flowConfig.flow.variable_name}}}`,
                                getMessageContent(newInputMessages[i + 1], true),
                            );
                        }
                    }
                }

                const userInput = last(newInputMessages)!;

                if (userInput.flow_config) {
                    if (userInput.flow_config.flow.ignore_context) {
                        // 忽略上下文
                        newInputMessages = newInputMessages.slice(-1);
                    }
                }

                newInputMessages.forEach((item) => {
                    let content = getMessageContent(item, true);

                    variables.forEach((value, key) => {
                        content = content.replace(new RegExp(key, 'g'), value);
                    });

                    if (typeof item.content === 'string') {
                        item.content = content;
                    } else if (
                        item.content &&
                        typeof item.content === 'object' &&
                        'content' in item.content
                    ) {
                        item.content.content = content;
                    }
                });

                const customModelRequest = getCustomModelRequest(selectedModelRef.current);

                return (customModelRequest?.request ?? modelRequest).create(
                    {
                        messages: newInputMessages?.map((item) => ({
                            role: item.role ?? '',
                            content: getMessageContent(item, true),
                        })),
                        model: customModelRequest
                            ? selectedModelRef.current
                                  .substring(CUSTOM_MODEL_PREFIX.length)
                                  .replace('_thinking', '')
                            : selectedModelRef.current,
                        temperature: getAppSettings()[AppSettingsGroup.SystemChat].temperature,
                        max_tokens: getAppSettings()[AppSettingsGroup.SystemChat].maxTokens,
                        enable_thinking: customModelRequest?.config?.support_thinking ?? false,
                        stream_options: {
                            include_usage: true,
                        },
                        thinking_budget:
                            getAppSettings()[AppSettingsGroup.SystemChat].thinkingBudgetTokens,
                        reasoning: customModelRequest?.config?.support_thinking
                            ? { effort: 'medium' }
                            : undefined,
                        stream: true,
                    },
                    callbacks,
                );
            },
        };
    }, [getAppSettings, getCustomModelRequest, selectedModelRef]);
    const [agent] = useXAgent<BubbleDataType>(modelAgentConfig);
    const loading = agent.isRequesting();

    const newestMessage = useRef<ChatMessage>(undefined);
    const { messages, onRequest, setMessages } = useXChat({
        agent,
        requestFallback: (...params): ChatMessage => {
            const [, { error }] = params;

            if (error.name === 'AbortError') {
                return {
                    content: {
                        reasoning_content: '',
                        content: intl.formatMessage({ id: 'tools.chat.requestAborted' }),
                        response_error: true,
                    },
                    role: 'assistant',
                };
            } else if (
                error.message.startsWith('Unknown error') &&
                newestMessage.current &&
                typeof newestMessage.current.content === 'object'
            ) {
                return {
                    content: {
                        ...newestMessage.current.content,
                    },
                    role: 'assistant',
                };
            }

            return {
                content: {
                    reasoning_content: '',
                    content: `${intl.formatMessage({ id: 'tools.chat.requestFailed' })}: ${error.message}`,
                    response_error: true,
                },
                role: 'assistant',
            };
        },
        transformMessage: (info): ChatMessage => {
            const { originMessage, chunk } = info || {};
            if (chunk && 'code' in chunk && 'message' in chunk) {
                const chatResponse = ServiceResponse.serviceError(
                    { status: 200, statusText: 'Service Error' } as Response,
                    chunk.code as number,
                    chunk.message as string,
                );
                chatResponse.success();
                return {
                    content: {
                        reasoning_content: '',
                        content: chatResponse.message ?? 'Service Error',
                        response_error: true,
                    },
                    role: 'assistant',
                };
            }

            if (typeof originMessage?.content === 'string') {
                return {
                    content: {
                        reasoning_content: '',
                        content: originMessage.content,
                        response_error: false,
                    },
                    role: originMessage.role as ChatMessage['role'],
                };
            }

            const messageContent = (originMessage?.content ?? {
                reasoning_content: '',
                content: '',
                response_error: false,
            }) as ChatMessage['content'];
            if (typeof messageContent === 'string') {
                throw new Error('messageContent is string');
            }

            try {
                if (chunk?.data && !chunk?.data.includes('DONE')) {
                    const message = JSON.parse(chunk?.data);

                    if (
                        'type' in message &&
                        message.type === 'content_block_delta' &&
                        'delta' in message
                    ) {
                        // Claude 格式的响应
                        if (message.delta.type === 'text_delta') {
                            messageContent.content += message.delta.text ?? '';
                        } else if (message.delta.type === 'thinking_delta') {
                            messageContent.reasoning_content += message.delta.thinking ?? '';
                        }
                    } else {
                        // OpenAI 格式的响应
                        const choiceDelta = message?.choices?.[0]?.delta;
                        if (choiceDelta) {
                            if (choiceDelta?.reasoning_content) {
                                messageContent.reasoning_content =
                                    messageContent.reasoning_content +
                                    choiceDelta?.reasoning_content;
                            } else {
                                messageContent.content += choiceDelta?.content ?? '';
                            }
                        }
                    }
                }
            } catch (error) {
                console.error(error);
            }

            newestMessage.current = {
                content: messageContent,
                role: 'assistant',
            };

            return newestMessage.current;
        },
        resolveAbortController: (controller) => {
            abortController.current = controller;
        },
    });

    const abortChat = useCallback(() => {
        abortController.current?.abort();
        setSendQueueMessages([]);
    }, [setSendQueueMessages]);

    const createNewSession = useCallback(async () => {
        return new Promise<void>((resolve) => {
            const currentDate = dayjs().format('YYYY-MM-DD');
            const sessionKey = `${currentDate}-${new Date().valueOf()}`;
            abortChat();
            setTimeout(() => {
                setSessionList((prev) => [
                    {
                        key: sessionKey,
                        label: intl.formatMessage({ id: 'tools.chat.newSession' }),
                        group: currentDate,
                        timestamp: new Date().valueOf(),
                        isDefaultSession: true,
                    },
                    ...prev,
                ]);
                setCurSession(sessionKey);
                setMessages([]);

                resolve();
            }, 100);
        });
    }, [abortChat, intl, setCurSession, setMessages, setSessionList]);

    const onNewSessionClick = useCallback(() => {
        if (messagesRef.current && messagesRef.current.length > 0) {
            createNewSession();
        } else {
            message.error(intl.formatMessage({ id: 'tools.chat.newSession.tip' }));
        }
    }, [createNewSession, intl, message]);

    const [openSession, setOpenSession] = useState(false);
    const chatHeader = (
        <div className="chatHeader">
            <Drawer
                open={openSession}
                placement="left"
                title={<FormattedMessage id="tools.chat.sessions" />}
                onClose={() => setOpenSession(false)}
                maskClosable
                closeIcon={false}
                styles={{ body: { padding: `${token.paddingXS}px ${token.padding}px` } }}
                extra={
                    <Button
                        type="text"
                        icon={<DeleteOutlined style={{ color: token.colorError }} />}
                        onClick={() => {
                            modal.confirm({
                                title: intl.formatMessage({
                                    id: 'tools.chat.session.clear',
                                }),
                                content: intl.formatMessage({
                                    id: 'tools.chat.session.clear.tip',
                                }),
                                onOk: () => {
                                    setMessages([]);
                                    setCurSession(undefined);
                                    setSessionList([]);
                                    setMessageHistory({});
                                    setOpenSession(false);
                                    chatHistoryStoreRef.current?.clear();
                                    abortChat();
                                },
                            });
                        }}
                    />
                }
            >
                <RSC>
                    <Conversations
                        items={sessionList?.map((i) =>
                            i.key === curSession
                                ? {
                                      ...i,
                                      label: (
                                          <div
                                              style={{ color: token.colorPrimary }}
                                          >{`[${intl.formatMessage({ id: 'tools.chat.session.current' })}] ${i.label}`}</div>
                                      ),
                                  }
                                : i,
                        )}
                        activeKey={curSession}
                        groupable
                        onActiveChange={async (val) => {
                            abortChat();
                            // The abort execution will trigger an asynchronous requestFallback, which may lead to timing issues.
                            // In future versions, the sessionId capability will be added to resolve this problem.
                            setTimeout(() => {
                                setCurSession(val);
                                setMessages(
                                    (messageHistory?.[val] || []) as MessageInfo<ChatMessage>[],
                                );
                            }, 100);

                            autoScrollRef.current = true;
                        }}
                        styles={{ item: { padding: '0 8px' } }}
                        className="conversations"
                    />
                </RSC>
            </Drawer>

            <Space>
                <Button
                    type="text"
                    icon={<SidebarIcon />}
                    disabled={sessionList.length === 0}
                    className="chatHeaderHeaderButton"
                    onClick={() => setOpenSession(true)}
                />

                <Select
                    value={selectedModel}
                    options={supportedModels.map((item) => ({
                        label: (
                            <ModelSelectLabel
                                modelName={item.name}
                                custom={!!item.customConfig}
                                reasoner={item.thinking}
                            />
                        ),
                        value: item.model,
                    }))}
                    variant="underlined"
                    disabled={loading}
                    onChange={(val) => {
                        setSelectedModel(val);
                        updateAppSettings(
                            AppSettingsGroup.Cache,
                            { chatModel: val },
                            true,
                            true,
                            false,
                        );
                    }}
                    styles={{ popup: { root: { minWidth: 256 } } }}
                    loading={supportedModelsLoading}
                />
            </Space>

            <div>
                <Button
                    type="text"
                    icon={<PlusOutlined />}
                    onClick={onNewSessionClick}
                    disabled={!(messages && messages.length > 0)}
                    title={intl.formatMessage(
                        {
                            id: 'draw.keyEventTooltip',
                        },
                        {
                            message: intl.formatMessage({ id: 'tools.chat.newSession' }),
                            key: hotKeys?.[KeyEventKey.ChatNewSession]?.hotKey,
                        },
                    )}
                >
                    <FormattedMessage id="tools.chat.newSession" />
                </Button>
            </div>
        </div>
    );

    const bubbleItems = useMemo((): BubbleDataType[] | undefined => {
        if (!messages || messages.length === 0) return undefined;

        const botAvatar = {
            icon: <BotIcon />,
            style: {
                color: token.colorPrimary,
                backgroundColor: 'transparent',
                fontSize: '2em',
            },
        };
        const list = messages.map((i): BubbleDataType => {
            const content = getMessageContent(i.message);

            return {
                role: i.message.role,
                placement: i.message.role === 'assistant' ? 'start' : 'end',
                content,
                classNames: {
                    content: i.status === 'loading' ? 'loadingMessage' : '',
                },
                variant: i.message.role === 'assistant' ? 'borderless' : 'filled',
                messageRender:
                    i.message.role === 'assistant'
                        ? () => {
                              return (
                                  <MarkdownContent
                                      darkMode={darkMode}
                                      content={content}
                                      clipboardContent={content}
                                  />
                              );
                          }
                        : undefined,
                avatar: i.message.role === 'assistant' ? botAvatar : undefined,
                // typing: i.status === 'loading' ? { step: 2, interval: 50 } : false,
            };
        });

        if (loading && last(list)?.role !== 'assistant') {
            list.push({
                loading: true,
                role: 'assistant',
                avatar: botAvatar,
                variant: 'borderless',
            });
        }

        return list;
    }, [darkMode, loading, messages, token.colorPrimary]);

    useEffect(() => {
        if (chatHistoryStoreRef.current) {
            return;
        }

        chatHistoryStoreRef.current = new ChatHistoryStore();
        setSessionStoreLoading(true);
        chatHistoryStoreRef.current.init().then(async () => {
            setSessionStoreLoading(false);

            const chatHistory = (await chatHistoryStoreRef.current!.entries()).sort((a, b) => {
                return b[1].session.key.localeCompare(a[1].session.key);
            });
            const sessionList = [];
            const messageHistory = {} as Record<string, MessageInfo<BubbleDataType>[]>;
            for (const [key, value] of chatHistory) {
                sessionList.push({
                    ...value.session,
                    isDefaultSession: false,
                });
                messageHistory[key] = value.messages;
            }
            setSessionList(sessionList);
            setMessageHistory(messageHistory);
        });
    }, [setSessionList, setMessages, setMessageHistory]);

    const scrollbarRef = useRef<Scrollbar | null>(null);
    const autoScrollRef = useRef<boolean>(true);

    const enableAutoScroll = useMemo(() => {
        return debounce(() => {
            autoScrollRef.current = true;
        }, 3000);
    }, []);
    const chatList = (
        <div className="chatList">
            <RSC
                ref={scrollbarRef as never}
                onWheel={() => {
                    autoScrollRef.current = false;
                    enableAutoScroll();
                }}
            >
                {bubbleItems ? (
                    /** 消息列表 */
                    <Bubble.List
                        style={{ height: '100%', paddingInline: 16 }}
                        items={bubbleItems}
                        key={curSession}
                        roles={{
                            assistant: {
                                placement: 'start',
                                loadingRender: () => (
                                    <Space>
                                        <Spin size="small" />
                                        <FormattedMessage id="tools.chat.agentPlaceholder" />
                                    </Space>
                                ),
                                footer: (content) => (
                                    <div style={{ display: 'flex' }}>
                                        <Button
                                            type="text"
                                            size="small"
                                            icon={<CopyOutlined />}
                                            onClick={() => {
                                                let textContent = '';
                                                if (
                                                    content &&
                                                    typeof content === 'object' &&
                                                    'props' in content
                                                ) {
                                                    textContent =
                                                        content['props']['clipboardContent'];
                                                } else if (typeof content === 'string') {
                                                    textContent = content;
                                                } else {
                                                    return;
                                                }

                                                navigator.clipboard.writeText(textContent);
                                            }}
                                        />
                                    </div>
                                ),
                            },
                            user: { placement: 'end' },
                        }}
                    />
                ) : (
                    <div className="chatWelcomeWrap">
                        <Welcome
                            variant="borderless"
                            title={intl.formatMessage({ id: 'tools.chat.welcome.title' })}
                            description={intl.formatMessage({
                                id: 'tools.chat.welcome.description',
                            })}
                        />
                    </div>
                )}
            </RSC>
        </div>
    );

    const messagesRef = useRef<MessageInfo<BubbleDataType>[]>([]);
    useEffect(() => {
        messagesRef.current = messages;
    }, [messages]);

    const onCopy = useCallback(() => {
        const lastMessage = last(messagesRef.current);
        copyText(lastMessage ? getMessageContent(lastMessage.message) : '');
    }, []);
    const onCopyAndHide = useCallback(() => {
        const lastMessage = last(messagesRef.current);
        copyTextAndHide(lastMessage ? getMessageContent(lastMessage.message) : '');
    }, []);

    useHotkeys(hotKeys?.[KeyEventKey.ChatCopyAndHide]?.hotKey ?? '', onCopyAndHide, {
        keyup: false,
        keydown: true,
        enableOnFormTags: ['INPUT', 'TEXTAREA', 'SELECT'],
    });

    useHotkeys(hotKeys?.[KeyEventKey.ChatCopy]?.hotKey ?? '', onCopy, {
        keyup: false,
        keydown: true,
        enableOnFormTags: ['INPUT', 'TEXTAREA', 'SELECT'],
    });

    useHotkeys(hotKeys?.[KeyEventKey.ChatNewSession]?.hotKey ?? '', onNewSessionClick, {
        keyup: false,
        keydown: true,
        enableOnFormTags: ['INPUT', 'TEXTAREA', 'SELECT'],
    });

    const senderLoading = loading || sendQueueMessages.length > 0;

    const handleUserSubmit = useCallback(
        (val: string, flowConfig?: ChatMessageFlowConfig) => {
            onRequest({
                stream: true,
                message: {
                    content: val,
                    role: 'user',
                    flow_config: flowConfig,
                },
            });

            if (
                sessionListRef.current.find((i) => i.key === curSessionRef.current)
                    ?.isDefaultSession
            ) {
                setSessionList((prev) =>
                    prev.map((i) =>
                        i.key !== curSessionRef.current
                            ? i
                            : {
                                  ...i,
                                  label: val?.replace(/\s+/g, ' ').trim().slice(0, 20),
                                  isDefaultSession: false,
                              },
                    ),
                );
            }
        },
        [onRequest, sessionListRef, curSessionRef, setSessionList],
    );

    const userSendingRef = useRef<boolean>(false);
    const onSenderSubmit = useCallback(
        async (value: string, flowConfig?: ChatMessageFlowConfig) => {
            if (!curSessionRef.current) {
                await createNewSession();
            }

            handleUserSubmit(value, flowConfig);
            setInputValue('');
            autoScrollRef.current = true;
            newestMessage.current = undefined;
        },
        [curSessionRef, handleUserSubmit, createNewSession],
    );

    useEffect(() => {
        if (!loading && sendQueueMessagesRef.current.length > 0) {
            onSenderSubmit(
                sendQueueMessagesRef.current[0].content,
                sendQueueMessagesRef.current[0].flow_config,
            );
            setSendQueueMessages((prev) => prev.slice(1));
        }
    }, [loading, onSenderSubmit, sendQueueMessagesRef, setSendQueueMessages]);

    useEffect(() => {
        if (!senderLoading) {
            userSendingRef.current = false;
        }
    }, [senderLoading]);

    const chatSender = (
        <div className="chatSend">
            <WorkflowList
                sendMessageAction={(message, _flowConfig) => {
                    const globalVariable = new Map<string, string>();
                    globalVariable.set('{{USER_INPUT}}', inputValue);
                    const flowConfig = _flowConfig
                        ? {
                              ..._flowConfig,
                              globalVariable,
                          }
                        : undefined;

                    if (userSendingRef.current) {
                        setSendQueueMessages((prev) =>
                            prev.concat({
                                content: message,
                                title:
                                    flowConfig?.name ??
                                    intl.formatMessage({
                                        id: 'tools.chat.sendQueue.userMessage',
                                    }),
                                flow_config: flowConfig,
                            }),
                        );
                        return;
                    }

                    userSendingRef.current = true;

                    onSenderSubmit(message, flowConfig);
                }}
            />

            <div className="chatSendHotkeysMenu">
                <HotkeysMenu
                    menu={{
                        items: [
                            {
                                label: (
                                    <FormattedMessage
                                        id="settings.hotKeySettings.keyEventTooltip"
                                        values={{
                                            message: <FormattedMessage id="tools.chat.chatCopy" />,
                                            key: hotKeys?.[KeyEventKey.ChatCopy]?.hotKey,
                                        }}
                                    />
                                ),
                                key: 'copy',
                                onClick: onCopy,
                            },
                            {
                                label: (
                                    <FormattedMessage
                                        id="settings.hotKeySettings.keyEventTooltip"
                                        values={{
                                            message: (
                                                <FormattedMessage id="tools.chat.chatCopyAndHide" />
                                            ),
                                            key: hotKeys?.[KeyEventKey.ChatCopyAndHide]?.hotKey,
                                        }}
                                    />
                                ),
                                key: 'copyAndHide',
                                onClick: onCopyAndHide,
                            },
                        ],
                    }}
                />
            </div>
            {/** 输入框 */}
            <Suggestion items={[]} onSelect={(itemVal) => setInputValue(`[${itemVal}]:`)}>
                {({ onKeyDown }) => (
                    <Sender
                        ref={senderRef}
                        loading={senderLoading}
                        value={inputValue}
                        onChange={(v) => {
                            if (v.length > 10000) {
                                setInputValue(v.substring(0, 10000));
                            } else {
                                setInputValue(v);
                            }
                        }}
                        disabled={sessionStoreLoading}
                        onSubmit={async (message) => {
                            if (!curSessionRef.current) {
                                await createNewSession();
                            }

                            onSenderSubmit(message);
                        }}
                        onCancel={abortChat}
                        placeholder={intl.formatMessage({ id: 'tools.chat.placeholder' })}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && (senderLoading || userSendingRef.current)) {
                                setSendQueueMessages((prev) =>
                                    prev.concat({
                                        content: inputValue,
                                        title: intl.formatMessage({
                                            id: 'tools.chat.sendQueue.userMessage',
                                        }),
                                    }),
                                );
                                setInputValue('');
                            }

                            onKeyDown(e);
                        }}
                        actions={(_, info) => {
                            const { SendButton, LoadingButton } = info.components;
                            return (
                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: token.marginXS,
                                    }}
                                >
                                    <SendQueueMessageList queue={sendQueueMessages} />
                                    {loading ? (
                                        <LoadingButton type="default" />
                                    ) : (
                                        <SendButton type="primary" />
                                    )}
                                </div>
                            );
                        }}
                    />
                )}
            </Suggestion>
        </div>
    );

    const updateHistory = useCallback(
        (msgList: MessageInfo<BubbleDataType>[] | undefined) => {
            const currentSession = curSessionRef.current;
            if (msgList && msgList.length > 0 && currentSession) {
                setMessageHistory((prev) => ({
                    ...prev,
                    [currentSession]: msgList,
                }));
                chatHistoryStoreRef.current?.set(currentSession, {
                    session: sessionListRef.current.find((i) => i.key === currentSession)!,
                    messages: msgList,
                });
            }
        },
        [curSessionRef, sessionListRef, setMessageHistory],
    );
    const updateHistoryDebounce = useMemo(() => debounce(updateHistory, 1000), [updateHistory]);

    const scrollToBottom = useMemo(() => {
        return throttle(() => {
            if (!autoScrollRef.current || !scrollbarRef.current) {
                return;
            }
            scrollbarRef.current.scrollToBottom();
        }, 100);
    }, []);

    useEffect(() => {
        updateHistoryDebounce(messages);
        scrollToBottom();
    }, [messages, updateHistoryDebounce, scrollToBottom]);

    const searchParams = useSearchParams();
    const searchParamsSign = searchParams.get('t');
    const searchParamsSelectText = searchParams.get('selectText');
    const prevSearchParamsSign = useRef<string | null>(null);
    const handleSelectedText = useCallback(async () => {
        if (prevSearchParamsSign.current === searchParamsSign) {
            return;
        }

        if (searchParamsSelectText) {
            let newSessionPromise: Promise<void> | undefined = undefined;
            if (
                messageHistoryRef.current &&
                curSessionRef.current &&
                messageHistoryRef.current[curSessionRef.current].length > 0 &&
                getAppSettings()[AppSettingsGroup.FunctionChat].autoCreateNewSession
            ) {
                newSessionPromise = createNewSession();
            }

            await finishScreenshot();

            if (newSessionPromise) {
                await newSessionPromise;
            }
            setInputValue(decodeParamsValue(searchParamsSelectText).substring(0, 10000));
        }

        setTimeout(() => {
            senderRef.current?.focus();
            prevSearchParamsSign.current = searchParamsSign;
        }, 64);
    }, [
        searchParamsSign,
        searchParamsSelectText,
        messageHistoryRef,
        curSessionRef,
        getAppSettings,
        setInputValue,
        createNewSession,
    ]);
    useEffect(() => {
        handleSelectedText();
    }, [handleSelectedText]);

    return (
        <div className="copilotChat">
            {/** 对话区 - header */}
            {chatHeader}

            {/** 对话区 - 消息列表 */}
            {chatList}

            {/** 对话区 - 输入框 */}
            {chatSender}

            <style jsx>{`
                :global(.copilotChat) {
                    display: flex;
                    width: 100%;
                    flex-direction: column;
                    background: var(--antd-color-bg-container);
                    color: var(--antd-color-text);
                }
                :global(.chatHeader) {
                    height: 64px;
                    box-sizing: border-box;
                    border-bottom: 1px solid var(--antd-color-border);
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: ${token.padding}px ${token.padding}px;
                }
                :global(.headerTitle) {
                    font-weight: 600;
                    font-size: 15px;
                }
                :global(.chatHeaderHeaderButton) {
                    font-size: 18px !important;
                }
                :global(.conversations) {
                    box-sizing: border-box;
                    padding: 0 !important;
                }
                :global(.conversations .ant-conversations-list) {
                    padding-inline-start: 0;
                }
                :global(.chatList) {
                    overflow: auto;
                    height: 100%;
                    padding: 0 ${token.padding}px;
                }

                :global(.chatWelcomeWrap) {
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    padding-bottom: 11.8%;
                }
                :global(.loadingMessage) {
                    background-image: linear-gradient(90deg, #ff6b23 0%, #af3cb8 31%, #53b6ff 89%);
                    background-size: 100% 2px;
                    background-repeat: no-repeat;
                    background-position: bottom;
                }
                :global(.chatSend) {
                    padding: 0px;
                    padding: ${token.padding}px;
                    position: relative;
                }
                :global(.chatSendHotkeysMenu) {
                    position: absolute;
                    right: 0;
                    transform: translateY(-100%) translateX(${-token.padding}px);
                    top: ${16}px;
                }
                :global(.speechButton) {
                    font-size: 18px;
                    color: var(--antd-color-text) !important;
                }

                :global(.ant-bubble-content-wrapper .ant-bubble-footer) {
                    opacity: 0;
                    transition: opacity ${token.motionDurationFast} ${token.motionEaseInOut};
                }

                :global(.ant-bubble-content-wrapper:hover .ant-bubble-footer) {
                    opacity: 1;
                }

                :global(.ant-bubble-content .ant-typography > p):first-child {
                    margin-top: ${token.marginXXS}px;
                }
            `}</style>
        </div>
    );
};

const ChatPage = () => {
    return (
        <Suspense>
            <div className="copilotWrapper">
                <Chat />

                <style jsx>{`
                    :global(.copilotWrapper) {
                        width: 100%;
                        height: 100%;
                        display: flex;
                        position: fixed;
                        top: 0;
                        left: 0;
                        right: 0;
                        bottom: 0;
                    }
                    :global(.workarea) {
                        flex: 1;
                        background: var(--antd-color-bg-layout);
                        display: flex;
                        flex-direction: column;
                    }
                    :global(.workareaHeader) {
                        box-sizing: border-box;
                        height: 52px;
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        padding: 0 48px 0 28px;
                        border-bottom: 1px solid var(--antd-color-border);
                    }
                    :global(.headerTitle) {
                        font-weight: 600;
                        font-size: 15px;
                        color: var(--antd-color-text);
                        display: flex;
                        align-items: center;
                        gap: 8px;
                    }
                    :global(.headerButton) {
                        background-image: linear-gradient(78deg, #8054f2 7%, #3895da 95%);
                        border-radius: 12px;
                        height: 24px;
                        width: 93px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        color: #fff;
                        cursor: pointer;
                        font-size: 12px;
                        font-weight: 600;
                        transition: all 0.3s;
                    }
                    :global(.headerButton:hover) {
                        opacity: 0.8;
                    }
                    :global(.workareaBody) {
                        flex: 1;
                        padding: 16px;
                        background: var(--antd-color-bg-container);
                        border-radius: 16px;
                        min-height: 0;
                    }
                    :global(.bodyContent) {
                        overflow: auto;
                        height: 100%;
                        padding-right: 10px;
                    }
                    :global(.bodyText) {
                        color: var(--antd-color-text);
                        padding: 8px;
                    }
                `}</style>
            </div>
        </Suspense>
    );
};

export default ChatPage;
