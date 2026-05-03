<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import QrcodeVue from 'qrcode.vue';
import { getBitifulConfigLocal, saveBitifulConfigLocal, type BitifulConfig } from '@/lib/bitifulConfig';
import { showToast } from 'vant';

const router = useRouter();

const qrCodeValue = ref('');

// 配置表单状态
const bitifulConfig = ref<BitifulConfig>({
  accessKey: '',
  secretKey: '',
  cdnToken: '',
  bucket: '',
  domain: '',
  coverStyle: '',
  previewStyle: '',
  albumStyle: '',
  region: 'cn-east-1',
  endpoint: 'https://s3.bitiful.net',
});

const showSecret = ref(false);

const onClickLeft = () => {
  router.back();
};

const updateQrCode = (config: BitifulConfig) => {
  const data = {
    type: 'bitiful_config',
    config: config
  };
  qrCodeValue.value = JSON.stringify(data);
};

onMounted(async () => {
  const localConfig = await getBitifulConfigLocal();
  if (localConfig) {
    bitifulConfig.value = localConfig;
    updateQrCode(localConfig);
  }
});

const onSaveConfig = async () => {
  try {
    await saveBitifulConfigLocal(bitifulConfig.value);
    updateQrCode(bitifulConfig.value);
    showToast('配置保存并生成二维码成功');
  } catch (error) {
    showToast('保存配置失败');
  }
};
</script>

<template>
  <div class="tool-view-container">
    <van-nav-bar
      title="S3 配置与生成二维码"
      left-text="返回"
      left-arrow
      @click-left="onClickLeft"
      placeholder
      class="safe-padding-top"
    />

    <div class="content-wrapper">
      <div class="config-container">
        <h3>S3 (Bitiful) 参数配置</h3>
        <van-form @submit="onSaveConfig">
          <van-cell-group inset>
            <van-field v-model="bitifulConfig.accessKey" name="accessKey" label="Access Key" placeholder="请输入 Access Key" />
            <van-field v-model="bitifulConfig.secretKey" :type="showSecret ? 'text' : 'password'" name="secretKey" label="Secret Key" placeholder="请输入 Secret Key">
              <template #right-icon>
                <van-icon
                  :name="showSecret ? 'eye-o' : 'closed-eye'"
                  @click="showSecret = !showSecret"
                />
              </template>
            </van-field>
            <van-field v-model="bitifulConfig.bucket" name="bucket" label="Bucket" placeholder="请输入 Bucket 名称" />
            <van-field v-model="bitifulConfig.region" name="region" label="Region" placeholder="请输入 Region" />
            <van-field v-model="bitifulConfig.endpoint" name="endpoint" label="Endpoint" placeholder="请输入 Endpoint" />
            <van-field v-model="bitifulConfig.domain" name="domain" label="CDN Domain" placeholder="（选填）自定义域名" />
            <van-field v-model="bitifulConfig.cdnToken" name="cdnToken" label="CDN Token" placeholder="（选填）请输入 CDN Token" />
            <van-cell title="💡 提示" value="配置样式节约流量" title-class="text-blue-600" value-class="text-gray-500 text-sm" />
            <van-field v-model="bitifulConfig.coverStyle" name="coverStyle" label="封面样式" placeholder="（选填）封面样式" />
            <van-field v-model="bitifulConfig.previewStyle" name="previewStyle" label="预览样式" placeholder="（选填）预览样式" />
            <van-field v-model="bitifulConfig.albumStyle" name="albumStyle" label="相册样式" placeholder="（选填）相册样式" />
          </van-cell-group>
          <div class="btn-wrapper">
            <van-button round block type="primary" native-type="submit">
              保存并生成二维码
            </van-button>
          </div>
        </van-form>
      </div>

      <div class="qr-container">
        <div v-if="qrCodeValue" class="qr-content">
          <h3>S3 配置二维码</h3>
          <div class="qr-wrapper">
            <qrcode-vue :value="qrCodeValue" :size="250" level="M" />
          </div>
          <p class="desc">
            请在另一台设备的“服务配置”页面中，<br>
            使用扫码功能扫描此二维码以快速填入配置。
          </p>
        </div>
        <div v-else class="empty-state">
          <van-empty description="请先填写并保存配置生成二维码" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tool-view-container {
  min-height: 100vh;
  background-color: #f7f8fa;
  box-sizing: border-box;
}

.content-wrapper {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* PC 端布局适配 */
@media (min-width: 768px) {
  .content-wrapper {
    flex-direction: row;
    align-items: flex-start;
    justify-content: center;
    max-width: 1200px;
    margin: 0 auto;
    padding: 32px 24px;
  }

  .config-container {
    flex: 1;
    max-width: 600px;
  }

  .qr-container {
    flex: 0 0 360px;
    position: sticky;
    top: 32px;
  }
}

.config-container h3, .qr-container h3 {
  margin-top: 0;
  margin-bottom: 16px;
  color: #323233;
  font-size: 18px;
  text-align: center;
  padding: 0 16px;
}

.btn-wrapper {
  margin: 16px;
}

.qr-container {
  background-color: #fff;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  overflow: hidden;
}

.qr-content {
  padding: 24px;
  text-align: center;
}

.qr-wrapper {
  display: flex;
  justify-content: center;
  margin-bottom: 16px;
}

.desc {
  margin-top: 16px;
  margin-bottom: 0;
  color: #969799;
  font-size: 14px;
  line-height: 1.5;
}

:deep(.van-cell-group--inset) {
  margin: 0;
}
</style>
