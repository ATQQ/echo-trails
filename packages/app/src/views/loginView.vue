<script setup lang="ts">
import { login } from '@/service';
import { showNotify } from 'vant';
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router';

const password = ref('')
const isPasswordVisible = ref(false)
const router = useRouter()
const checkLogin = () => {
  handleLogin()
}

const handleLogin = (silent = false) => {
  localStorage.setItem('token', password.value)
  login().then(() => {
    router.replace({
      name: 'album'
    })
    if (silent) return;
    showNotify({ type: 'success', message: '登录成功！' });
  }).catch(() => {
    if (silent) return;
    showNotify({ type: 'danger', message: '无效秘钥！' });
  })
}

onMounted(() => {
  handleLogin(true)
})
const togglePasswordVisibility = () => {
  isPasswordVisible.value = !isPasswordVisible.value
}
</script>

<template>
  <div class="login-container">
    <div class="login-card">
      <div class="header">
        <img src="https://api.iconify.design/mdi:cat.svg" alt="Cute Cat" class="cat-icon" />
        <h1>欢迎回来</h1>
        <p>请输入密码登录</p>
      </div>

      <div class="form-group">
        <div class="password-input">
          <input :type="isPasswordVisible ? 'text' : 'password'" v-model="password" placeholder="请输入密码"
            @keyup.enter="checkLogin" />
          <button class="toggle-visibility" @click="togglePasswordVisibility">
            <img :src="isPasswordVisible
              ? 'https://api.iconify.design/mdi:eye-off.svg'
              : 'https://api.iconify.design/mdi:eye.svg'" :alt="isPasswordVisible ? '隐藏密码' : '显示密码'" />
          </button>
        </div>
      </div>

      <button class="login-button" @click="checkLogin">
        登录
      </button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.login-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: linear-gradient(135deg, #fce4ec 0%, #f8bbd0 100%);
}

.login-card {
  width: 100%;
  max-width: 320px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 20px;
  padding: 30px 20px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
  animation: float 6s ease-in-out infinite;
}

@keyframes float {
  0% {
    transform: translateY(0px);
  }

  50% {
    transform: translateY(-10px);
  }

  100% {
    transform: translateY(0px);
  }
}

.header {
  text-align: center;
  margin-bottom: 30px;

  .cat-icon {
    width: 60px;
    height: 60px;
    margin-bottom: 16px;
    filter: invert(73%) sepia(11%) saturate(1384%) hue-rotate(307deg) brightness(101%) contrast(97%);
  }

  h1 {
    color: #e91e63;
    font-size: 24px;
    margin-bottom: 8px;
  }

  p {
    color: #9e9e9e;
    font-size: 14px;
  }
}

.form-group {
  margin-bottom: 24px;

  .password-input {
    position: relative;

    input {
      width: 100%;
      padding: 12px 40px 12px 16px;
      border: 2px solid #f8bbd0;
      border-radius: 12px;
      font-size: 16px;
      transition: all 0.3s ease;
      box-sizing: border-box;

      &:focus {
        outline: none;
        border-color: #f06292;
        box-shadow: 0 0 0 3px rgba(240, 98, 146, 0.2);
      }
    }

    .toggle-visibility {
      position: absolute;
      right: 12px;
      top: 50%;
      transform: translateY(-50%);
      background: none;
      border: none;
      padding: 4px;
      cursor: pointer;

      img {
        width: 20px;
        height: 20px;
        opacity: 0.5;
        transition: opacity 0.3s ease;
      }

      &:hover img {
        opacity: 0.8;
      }
    }
  }
}

.login-button {
  width: 100%;
  padding: 14px;
  background: linear-gradient(45deg, #f06292, #ec407a);
  border: none;
  border-radius: 12px;
  color: white;
  font-size: 16px;
  font-weight: bold;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(236, 64, 122, 0.3);
  }

  &:active {
    transform: translateY(0);
  }
}
</style>
