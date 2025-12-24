<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { showToast } from 'vant';
import { getUserList, addUser, addOperator, updatePassword, type User } from '@/service';

const router = useRouter();
const userList = ref<User[]>([]);
const loading = ref(false);
const activeNames = ref([]);

// Dialog State
const showAddUser = ref(false);
const showAddOperator = ref(false);
const showUpdatePassword = ref(false);

const formData = ref({
  username: '',
  operator: '',
  token: ''
});

const currentActionUser = ref<User | null>(null);
const currentActionOperator = ref<string>('');

const loadUsers = async () => {
  loading.value = true;
  try {
    userList.value = await getUserList();
  } catch (e) {
    showToast('Failed to load users');
  } finally {
    loading.value = false;
  }
};

const handleAddUser = async () => {
  if (!formData.value.username || !formData.value.operator || !formData.value.token) {
    showToast('Please fill all fields');
    return;
  }
  try {
    await addUser(formData.value);
    showToast('User added');
    showAddUser.value = false;
    loadUsers();
  } catch (e: any) {
    showToast(e.message || 'Failed');
  }
};

const openAddOperator = (user: User) => {
  currentActionUser.value = user;
  formData.value = { username: user.username, operator: '', token: '' };
  showAddOperator.value = true;
};

const handleAddOperator = async () => {
   if (!formData.value.operator || !formData.value.token) {
    showToast('Please fill all fields');
    return;
  }
  try {
    await addOperator(formData.value);
    showToast('Operator added');
    showAddOperator.value = false;
    loadUsers();
  } catch (e: any) {
    showToast(e.message || 'Failed');
  }
}

const openUpdatePassword = (user: User, operatorName: string) => {
  currentActionUser.value = user;
  currentActionOperator.value = operatorName;
  formData.value = { username: user.username, operator: operatorName, token: '' };
  showUpdatePassword.value = true;
};

const handleUpdatePassword = async () => {
   if (!formData.value.token) {
    showToast('Please enter new token');
    return;
  }
  try {
    await updatePassword(formData.value);
    showToast('Password updated');
    showUpdatePassword.value = false;
    loadUsers();
  } catch (e: any) {
    showToast(e.message || 'Failed');
  }
}

onMounted(loadUsers);
</script>

<template>
  <div class="account-list-container">
    <van-nav-bar
      title="账号管理"
      left-text="返回"
      left-arrow
      @click-left="router.back()"
      fixed
      placeholder
      class="safe-padding-top"
      right-text="新增"
      @click-right="showAddUser = true; formData = { username: '', operator: '', token: '' }"
    />

    <div class="content">
      <van-collapse v-model="activeNames" accordion>
        <van-collapse-item v-for="user in userList" :key="user.username" :title="user.username + (user.isSystem ? ' (系统)' : '')" :name="user.username">
          <van-cell-group>
            <van-cell v-for="op in user.operators" :key="op.name" :title="op.name">
               <template #right-icon>
                 <van-button size="small" type="primary" @click.stop="openUpdatePassword(user, op.name)" v-if="!user.isSystem">修改密码</van-button>
                 <span v-else style="font-size: 12px; color: #999;">系统内置</span>
               </template>
            </van-cell>
            <van-cell title="添加操作员" is-link @click="openAddOperator(user)" v-if="!user.isSystem" />
          </van-cell-group>
        </van-collapse-item>
      </van-collapse>
    </div>

    <!-- Dialogs -->
    <van-dialog v-model:show="showAddUser" title="新增账号组" show-cancel-button @confirm="handleAddUser">
       <div class="dialog-content">
         <van-field v-model="formData.username" label="账户名" placeholder="请输入账户名" />
         <van-field v-model="formData.operator" label="操作员" placeholder="请输入操作员名" />
         <van-field v-model="formData.token" label="Token" placeholder="请输入Token" />
       </div>
    </van-dialog>
    
    <van-dialog v-model:show="showAddOperator" title="新增操作员" show-cancel-button @confirm="handleAddOperator">
       <div class="dialog-content">
         <van-cell title="账户名" :value="formData.username" />
         <van-field v-model="formData.operator" label="操作员" placeholder="请输入操作员名" />
         <van-field v-model="formData.token" label="Token" placeholder="请输入Token" />
       </div>
    </van-dialog>

    <van-dialog v-model:show="showUpdatePassword" title="修改密码" show-cancel-button @confirm="handleUpdatePassword">
       <div class="dialog-content">
         <van-cell title="账户名" :value="formData.username" />
         <van-cell title="操作员" :value="formData.operator" />
         <van-field v-model="formData.token" label="新Token" placeholder="请输入新Token" />
       </div>
    </van-dialog>

  </div>
</template>

<style scoped>
.content {
  padding: 16px;
}
.dialog-content {
  padding: 10px 0;
}
</style>
