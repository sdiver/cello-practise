<script setup lang="ts">
import { NMessageProvider, NDialogProvider, NNotificationProvider } from 'naive-ui'
import AppLayout from './components/layout/AppLayout.vue'
</script>

<template>
  <n-message-provider>
    <n-dialog-provider>
      <n-notification-provider>
        <AppLayout />
      </n-notification-provider>
    </n-dialog-provider>
  </n-message-provider>
</template>
