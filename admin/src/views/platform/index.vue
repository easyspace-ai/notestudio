<template>
    <div class="main" ref="dropzone">
        <AdminMenu v-if="isPlatformConsole()" />
        <div v-if="isPlatformConsole()" class="platform-main">
            <PlatformManageTenantBar />
            <div class="platform-router">
                <RouterView />
            </div>
        </div>
        <template v-else>
            <Menu />
            <RouterView />
        </template>
        <div v-if="!isPlatformConsole()" class="upload-mask" v-show="ismask">
            <input type="file" style="display: none" ref="uploadInput" accept=".pdf,.docx,.doc,.pptx,.ppt,.txt,.md,.jpg,.jpeg,.png,.csv,.xls,.xlsx" />
            <UploadMask></UploadMask>
        </div>
        <!-- 平台管理端也需要全局设置（模型管理、Ollama、存储等）；仅租户端显示上传遮罩 -->
        <Settings />
    </div>
</template>
<script setup lang="ts">
import Menu from '@/components/menu.vue'
import AdminMenu from '@/components/AdminMenu.vue'
import PlatformManageTenantBar from '@/components/PlatformManageTenantBar.vue'
import { ref, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router'
import useKnowledgeBase from '@/hooks/useKnowledgeBase'
import UploadMask from '@/components/upload-mask.vue'
import Settings from '@/views/settings/Settings.vue'
import { getKnowledgeBaseById } from '@/api/knowledge-base/index'
import { MessagePlugin } from 'tdesign-vue-next'
import { useI18n } from 'vue-i18n'
import { isPlatformConsole } from '@/composables/usePlatformConsole'

let { requestMethod } = useKnowledgeBase()
const route = useRoute();
let ismask = ref(false)
let uploadInput = ref();
const { t } = useI18n();

// 用于跟踪拖拽进入/离开的计数器，解决子元素触发 dragleave 的问题
let dragCounter = 0;

// 获取当前知识库ID
const getCurrentKbId = (): string | null => {
    return (route.params as any)?.kbId as string || null
}

// 检查知识库初始化状态
const checkKnowledgeBaseInitialization = async (): Promise<boolean> => {
    const currentKbId = getCurrentKbId();
    
    if (!currentKbId) {
        MessagePlugin.error(t('knowledgeBase.missingId'));
        return false;
    }
    
    try {
        const kbResponse = await getKnowledgeBaseById(currentKbId);
        const kb = kbResponse.data;
        
        if (!kb.embedding_model_id || !kb.summary_model_id) {
            MessagePlugin.warning(t('knowledgeBase.notInitialized'));
            return false;
        }
        return true;
    } catch (error) {
        MessagePlugin.error(t('knowledgeBase.getInfoFailed'));
        return false;
    }
}


// 全局拖拽事件处理
const handleGlobalDragEnter = (event: DragEvent) => {
    event.preventDefault();
    dragCounter++;
    if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'all';
    }
    ismask.value = true;
}

const handleGlobalDragOver = (event: DragEvent) => {
    event.preventDefault();
    if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy';
    }
}

const handleGlobalDragLeave = (event: DragEvent) => {
    event.preventDefault();
    dragCounter--;
    if (dragCounter === 0) {
        ismask.value = false;
    }
}

const handleGlobalDrop = async (event: DragEvent) => {
    event.preventDefault();
    dragCounter = 0;
    ismask.value = false;
    
    const DataTransferFiles = event.dataTransfer?.files ? Array.from(event.dataTransfer.files) : [];
    const DataTransferItemList = event.dataTransfer?.items ? Array.from(event.dataTransfer.items) : [];
    
    const isInitialized = await checkKnowledgeBaseInitialization();
    if (!isInitialized) {
        return;
    }
    
    if (DataTransferFiles.length > 0) {
        DataTransferFiles.forEach(file => requestMethod(file, uploadInput));
    } else if (DataTransferItemList.length > 0) {
        DataTransferItemList.forEach(dataTransferItem => {
            const fileEntry = dataTransferItem.webkitGetAsEntry() as FileSystemFileEntry | null;
            if (fileEntry) {
                fileEntry.file((file: File) => requestMethod(file, uploadInput));
            }
        });
    } else {
        MessagePlugin.warning(t('knowledgeBase.dragFileNotText'));
    }
}

// 组件挂载时添加全局事件监听器（终端用户控制台才启用拖拽上传）
onMounted(() => {
    if (isPlatformConsole()) return
    document.addEventListener('dragenter', handleGlobalDragEnter, true);
    document.addEventListener('dragover', handleGlobalDragOver, true);
    document.addEventListener('dragleave', handleGlobalDragLeave, true);
    document.addEventListener('drop', handleGlobalDrop, true);
});

// 组件卸载时移除全局事件监听器
onUnmounted(() => {
    if (isPlatformConsole()) return
    document.removeEventListener('dragenter', handleGlobalDragEnter, true);
    document.removeEventListener('dragover', handleGlobalDragOver, true);
    document.removeEventListener('dragleave', handleGlobalDragLeave, true);
    document.removeEventListener('drop', handleGlobalDrop, true);
    dragCounter = 0;
});
</script>
<style lang="less">
.main {
    display: flex;
    width: 100%;
    height: 100%;
    min-width: 600px;
    /* 统一整页背景，让左侧菜单与右侧内容区视觉连贯 */
    background: var(--td-bg-color-container);
}

/* 平台端：左侧菜单 + 右侧单列（顶部租户栏 + 下方页面），避免租户栏独占一列 */
.platform-main {
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.platform-router {
    flex: 1;
    min-height: 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: auto;
}

.upload-mask {
    background-color: rgba(255, 255, 255, 0.8);
    position: fixed;
    width: 100%;
    height: 100%;
    z-index: 999;
    display: flex;
    justify-content: center;
    align-items: center;
}

img {
    -webkit-user-drag: none;
    -khtml-user-drag: none;
    -moz-user-drag: none;
    -o-user-drag: none;
    user-drag: none;
}
</style>