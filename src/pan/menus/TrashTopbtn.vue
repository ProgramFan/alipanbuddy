<script setup lang="ts">
import {
  menuTrashSelectFile,
  topRecoverSelectedFile,
  topRestoreSelectedFile,
  topTrashDeleteAll
} from '../topbtns/topbtn'
import { computed } from 'vue'
import { t } from '../../i18n'

const props = defineProps({
  dirtype: {
    type: String,
    required: true
  },
  isselected: {
    type: Boolean,
    required: true
  }
})

const showClearTrash = computed(() => props.dirtype === 'trash' && !props.isselected)
const showTrashSelected = computed(() => props.dirtype === 'trash' && props.isselected)

</script>

<template>
  <div v-show="showClearTrash" class="toppanbtn">
    <a-button type="text" size="small" tabindex="-1" class="danger" @click="topTrashDeleteAll"><IconFont name="iconqingkong" />{{ t('file.clearTrash') }}
    </a-button>
  </div>
  <div v-show="showTrashSelected" class="toppanbtn">
    <a-button type="text" size="small" tabindex="-1" @click="topRestoreSelectedFile"><IconFont name="iconrecover" />{{ t('file.restoreSelected') }}
    </a-button>
    <a-button type="text" size="small" tabindex="-1" class="danger" @click="() => menuTrashSelectFile(false, true)"><IconFont name="iconrest" />{{ t('file.deletePermanently') }}
    </a-button>
  </div>

  <div v-show="dirtype == 'recover' && isselected" class="toppanbtn">
    <a-button type="text" size="small" tabindex="-1" @click="topRecoverSelectedFile"><IconFont name="iconrecover" />{{ t('file.restore') }}
    </a-button>
  </div>
</template>
<style></style>
