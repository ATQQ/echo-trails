<script setup lang="ts">
import { isTauri } from '@/constants';
import { login } from '@/service';
import { useLocalStorage } from '@vueuse/core';
import { showNotify } from 'vant';
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

const password = ref('');
const isPasswordVisible = ref(false);
const router = useRouter();

const { value: userInfo } = useLocalStorage('userInfo', {
  username: '',
  operator: ''
});

const handleLogin = (silent = false) => {
  if (isTauri) {
    localStorage.clear();
  }
  localStorage.setItem('token', password.value);
  login().then((res) => {
    userInfo.username = res.data.username;
    userInfo.operator = res.data.operator;
    router.replace({
      name: 'album'
    });
    if (silent) return;
    showNotify({ type: 'success', message: '登录成功！' });
  }).catch(() => {
    if (silent) return;
    showNotify({ type: 'danger', message: '无效秘钥！' });
  });
};

const checkLogin = () => {
  handleLogin();
};

const goToSettings = () => {
  router.push({ name: 'set' });
};

onMounted(() => {
  if (localStorage.getItem('token')) {
    handleLogin(true);
  }
});
</script>

<template>
  <div class="login-container safe-padding-top">
    <div class="header">
      <div class="settings-icon" @click="goToSettings">
        <van-icon name="setting-o" size="24" color="#333" />
      </div>
    </div>

    <div class="content">
      <div class="brand-section">
        <h1 class="app-name">Echo Trails</h1>
        <p class="slogan">记录你的美好瞬间</p>
      </div>

      <div class="features-section">
        <div class="feature-item">
          <div class="icon-circle image-bg">
            <van-icon name="photo" size="24" color="#fff" />
          </div>
          <span>图片</span>
        </div>
        <div class="feature-item">
          <div class="icon-circle video-bg">
            <van-icon name="play-circle" size="24" color="#fff" />
          </div>
          <span>视频</span>
        </div>
        <div class="feature-item">
          <div class="icon-circle audio-bg">
            <van-icon name="music" size="24" color="#fff" />
          </div>
          <span>音频</span>
        </div>
      </div>

      <div class="form-section">
        <van-field v-model="password" :type="isPasswordVisible ? 'text' : 'password'" placeholder="请输入访问秘钥"
          left-icon="lock" :right-icon="isPasswordVisible ? 'eye-o' : 'closed-eye'"
          @click-right-icon="isPasswordVisible = !isPasswordVisible" class="password-field" @keyup.enter="checkLogin" />

        <van-button type="primary" block round class="login-btn" @click="checkLogin">
          确定
        </van-button>
      </div>
    </div>

    <div class="footer">
      <p>Secure & Private Storage</p>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.login-container {
  min-height: 100vh;
  box-sizing: border-box;
  background-color: #f7f8fa;
  display: flex;
  flex-direction: column;
  position: relative;
}

.header {
  padding: 16px;
  display: flex;
  justify-content: flex-end;

  .settings-icon {
    padding: 8px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.8);
    backdrop-filter: blur(4px);
    cursor: pointer;
    transition: transform 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;

    &:active {
      transform: scale(0.95);
    }
  }
}

.content {
  flex: 1;
  padding: 20px 32px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  margin-top: -60px;
  /* Offset to center visually better */
}

.brand-section {
  text-align: center;
  margin-bottom: 40px;

  .app-name {
    font-size: 32px;
    font-weight: 800;
    background: linear-gradient(45deg, #1989fa, #7bc6ff);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    margin-bottom: 8px;
    letter-spacing: 1px;
  }

  .slogan {
    font-size: 14px;
    color: #969799;
    letter-spacing: 2px;
  }
}

.features-section {
  display: flex;
  justify-content: space-around;
  margin-bottom: 48px;

  .feature-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;

    span {
      font-size: 12px;
      color: #646566;
    }
  }

  .icon-circle {
    width: 56px;
    height: 56px;
    border-radius: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
    transition: transform 0.2s;

    &:active {
      transform: scale(0.95);
    }

    &.image-bg {
      background: linear-gradient(135deg, #ff9a9e 0%, #fecfef 99%, #fecfef 100%);
    }

    &.video-bg {
      background: linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%);
    }

    &.audio-bg {
      background: linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%);
    }
  }
}

.form-section {
  .password-field {
    border-radius: 12px;
    margin-bottom: 24px;
    background: #fff;
    padding: 16px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
  }

  .login-btn {
    height: 48px;
    font-size: 16px;
    font-weight: 600;
    box-shadow: 0 4px 12px rgba(25, 137, 250, 0.3);
  }
}

.footer {
  padding: 24px;
  text-align: center;

  p {
    font-size: 12px;
    color: #c8c9cc;
    font-family: monospace;
  }
}
</style>
