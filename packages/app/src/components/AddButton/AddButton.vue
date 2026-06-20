<template>
    <div
        class="add-btn"
        :class="[`add-btn--${variant}`]"
        @click="handleClick"
    >
        <van-icon :name="icon" size="16"/>
    </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
    icon?: string
    variant?: 'primary' | 'success'
}>(), {
    icon: 'plus',
    variant: 'primary',
})

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
    bottom: var(--footer-area-height);
    z-index: 1;
    color: #fff;
    border-radius: 50%;
    box-sizing: border-box;
    width: 36px;
    height: 36px;
    display: flex;
    justify-content: center;
    align-items: center;
    transition: background-color 0.2s ease;
}

.add-btn--primary {
    background-color: var(--van-primary-color);
}

.add-btn--success {
    background-color: #07c160;
}
</style>
