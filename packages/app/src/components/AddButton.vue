<template>
    <div class="add-btn" @click="handleClick">
        <van-icon name="plus" size="16"/>
    </div>
</template>

<script setup lang="ts">
const emit = defineEmits<{
    (e: 'click'): void
}>()

const handleClick = () => {
    emit('click')
}
</script>

<style scoped>
.add-btn {
    position: fixed;
    right: 20px;
    bottom: 60px;
    z-index: 1;
    background-color: var(--van-primary-color);
    color: #fff;
    border-radius: 50%;
    box-sizing: border-box;
    width: 36px;
    height: 36px;
    display: flex;
    justify-content: center;
    align-items: center;
}
</style>
