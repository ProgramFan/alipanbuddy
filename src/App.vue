<script lang="ts">
import { computed, defineAsyncComponent, h } from 'vue'
import { ConfigProvider } from '@arco-design/web-vue'
import enUS from '@arco-design/web-vue/es/locale/lang/en-us'
import zhCN from '@arco-design/web-vue/es/locale/lang/zh-cn'
import { useLocale } from './i18n'
import { useAppStore } from './store'
import PageMain from './layout/PageMain.vue'
import './assets/global.css'
import './assets/fileitem.css'

const PageImage = defineAsyncComponent(() => import('./layout/PageImage.vue'))
const PageOffice = defineAsyncComponent(() => import('./layout/PageOffice.vue'))

export default {
  setup() {
    const appStore = useAppStore()
    const locale = useLocale()
    const arcoLocale = computed(() => locale.value === 'en-US' ? enUS : zhCN)
    return () => {
      let page
      if (appStore.appPage == 'PageImage') page = h(PageImage)
      else if (appStore.appPage == 'PageOffice') page = h(PageOffice)
      else page = h(PageMain)
      return h(ConfigProvider, { locale: arcoLocale.value }, () => page)
    }
  }
}
</script>
