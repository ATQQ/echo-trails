<script lang="ts" setup>
import { ref, onMounted, reactive } from 'vue'

const albumList = ref<any[]>([])

const loadAlbum = () => {

}

onMounted(() => {
  loadAlbum()
})

const showAddModal = ref(false)

const addData = reactive({
  name: '',
  description: '',
  isLarge: false,
})
const onSubmit = () => {

}
</script>

<template>
  <div class="album">
    <h1>相册</h1>
    <!-- 大卡片 -->
    <van-grid :column-num="1" :border="false">
      <van-grid-item>
        <div class="large-card">
          <van-image fit="cover" position="center" width="100%" height="100%" lazy-load
            src="https://fastly.jsdelivr.net/npm/@vant/assets/cat.jpeg">
            <template v-slot:loading>
              <van-loading type="spinner" size="20" />
            </template>
          </van-image>
          <!-- 标题和描述 -->
          <div class="title-desc">
            <h2>真不错噢</h2>
            <p>描述信息噢</p>
          </div>
        </div>
      </van-grid-item>
    </van-grid>
    <!-- 小卡片分类 -->
    <van-grid :gutter="10" :column-num="2" :border="false">
      <van-grid-item>
        <div class="small-card">
          <van-image fit="cover" position="center" width="100%" height="100%" lazy-load
            src="https://fastly.jsdelivr.net/npm/@vant/assets/cat.jpeg">
            <template v-slot:loading>
              <van-loading type="spinner" size="20" />
            </template>
          </van-image>
          <div class="title-desc">
            <h2>真不错噢</h2>
            <p>123</p>
          </div>
        </div>
      </van-grid-item>
      <van-grid-item>
        <div class="small-card">
          <van-image fit="cover" position="center" width="100%" height="100%" lazy-load
            src="https://fastly.jsdelivr.net/npm/@vant/assets/cat.jpeg">
            <template v-slot:loading>
              <van-loading type="spinner" size="20" />
            </template>
          </van-image>
          <div class="title-desc">
            <h2>真不错噢</h2>
            <p>132</p>
          </div>
        </div>
      </van-grid-item>
    </van-grid>
  </div>
  <!-- 添加相册 -->
  <div @click="showAddModal = true" v-show="!showAddModal" class="add-container">
    <van-icon name="plus" size="18" />
  </div>
  <van-popup @close="showAddModal = false" v-model:show="showAddModal" round position="bottom"
    :style="{ height: '50%' }">
    <van-form @submit="onSubmit">
      <van-cell-group inset>
        <van-field v-model="addData.name" name="相册名" label="相册名" placeholder="请输入相册名"
          :rules="[{ required: true, message: '请填写相册名' }]" />
        <van-field v-model="addData.description" show-word-limit maxlength="100" type="textarea" name="描述" label="描述"
          placeholder="描述" />
        <van-field name="switch" label="大卡片">
          <template #input>
            <van-switch v-model="addData.isLarge" />
          </template>
        </van-field>
      </van-cell-group>
      <div style="margin: 16px;">
        <van-button round block type="primary" native-type="submit">
          提交
        </van-button>
      </div>
    </van-form>
  </van-popup>
</template>

<style scoped lang="scss">
.album {
  padding-bottom: 60px;
}

h1 {
  font-weight: lighter;
  margin-bottom: 0;
  padding-left: 10px;
}

.large-card {
  position: relative;
  border-radius: 10px;
  overflow: hidden;
  height: 100vw;

  .title-desc {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;

    h2,
    p {
      color: #fff;
      padding-left: 20px;
    }

    h2 {
      margin-bottom: 6px;
    }

    p {
      margin-top: 0;
    }
  }
}

.small-card {
  overflow: hidden;

  :deep(.van-image) {
    border-radius: 10px;
    height: 40vw !important;
    width: 40vw !important;
    overflow: hidden;
  }

  .title-desc {
    h2 {
      margin: 2px 0;
      color: #000;
      font-size: 14px;
      font-weight: normal;
    }

    p {
      margin-top: 0;
      font-size: 10px;
      color: #666;
      font-weight: lighter;
    }
  }
}

.add-container {
  position: fixed;
  right: 10px;
  bottom: 60px;
  z-index: 1;
  padding: 4px;
  background-color: var(--van-primary-color);
  color: #fff;
  border-radius: 50%;
}
</style>
