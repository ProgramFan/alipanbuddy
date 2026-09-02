import { computed, onMounted, ref, watch, type Ref } from 'vue'
import { useUserStore } from '../../store'
import UserDAL from '../../user/userdal'
import message from '../../utils/message'
import type { DuplicateDriveTarget } from '../../utils/drive-tools/duplicates'

export type DriveScanTarget = DuplicateDriveTarget

/** Every drive-tools row is addressed by the same triple, and the delete helpers report deleted rows with the same key. */
export interface DriveScanItem {
  userId: string
  driveId: string
  fileId: string
}

interface DriveScanDeleteResult {
  report: string
  deletedFileKeys: string[]
  failed: number
}

interface DriveScanTexts {
  scanFailed: string
  scanEmpty: string
  scanFound?: (count: number) => string
  deleteNone: string
  deleteConfirm: (count: number) => string
  deletePartial: string
  deleteDone: string
  deleteFailed: string
}

export interface DriveScanConfig<Row, Item extends DriveScanItem> {
  texts: DriveScanTexts
  /** Selectable items carried by one list row: the row itself for flat lists, its files for grouped ones. */
  itemsOf: (row: Row) => Item[]
  /** Rebuilds a row after some of its items were deleted. Only grouped lists need it. */
  withItems?: (row: Row, items: Item[]) => Row
  /** Fills `rows` and returns the report shown above the list. */
  scan: (targets: DriveScanTarget[], rows: Ref<Row[]>) => Promise<string>
  remove: (items: Item[]) => Promise<DriveScanDeleteResult>
}

export const driveKey = (target: DriveScanTarget) => `${target.userId}\n${target.driveId}`

export const itemKey = (item: DriveScanItem) => `${item.userId}\n${item.driveId}\n${item.fileId}`

const loadDriveTargets = async (): Promise<DriveScanTarget[]> => {
  const users = await UserDAL.GetUserListFromDB()
  const targets: DriveScanTarget[] = []
  const seen = new Set<string>()
  for (const user of users) {
    if (!user?.user_id || !user?.access_token) continue
    const name = user.nick_name || user.user_name || user.name || user.user_id
    const add = (driveId: string, rootId: string, suffix = '') => {
      if (!driveId) return
      const target = { userId: user.user_id, driveId, rootId, name: `${name}${suffix}` }
      const key = driveKey(target)
      if (seen.has(key)) return
      seen.add(key)
      targets.push(target)
    }
    add(user.resource_drive_id, 'resource_root', ' / 资源盘')
    add(user.backup_drive_id, 'backup_root', ' / 备份盘')
    add(user.default_drive_id, 'root', ' / 默认盘')
  }
  return targets
}

/** Shared scaffold behind the drive-tools plugin pages: drive picker, scan/delete runners and the checkbox selection. */
export function useDriveScan<Row, Item extends DriveScanItem>(config: DriveScanConfig<Row, Item>) {
  const userStore = useUserStore()
  const driveOptions = ref<DriveScanTarget[]>([])
  const selectedDriveKeys = ref<string[]>([])
  const loading = ref(false)
  const deleting = ref(false)
  const result = ref('')
  const rows = ref<Row[]>([]) as Ref<Row[]>
  const selected = ref(new Set<string>())

  const loadDriveOptions = async () => {
    const targets = await loadDriveTargets()
    driveOptions.value = targets
    if (!selectedDriveKeys.value.length && targets.length) selectedDriveKeys.value = [driveKey(targets[0])]
  }

  const selectedTargets = computed(() => driveOptions.value.filter(target => selectedDriveKeys.value.includes(driveKey(target))))
  const allItems = computed(() => rows.value.flatMap(config.itemsOf))
  const selectedItems = computed(() => allItems.value.filter(item => selected.value.has(itemKey(item))))

  const reset = () => {
    result.value = ''
    rows.value = []
    selected.value = new Set()
  }

  const isSelected = (item: Item) => selected.value.has(itemKey(item))

  const toggleItems = (items: Item[]) => {
    const keys = items.map(itemKey)
    const allSelected = keys.length > 0 && keys.every(key => selected.value.has(key))
    const next = new Set(selected.value)
    keys.forEach(key => (allSelected ? next.delete(key) : next.add(key)))
    selected.value = next
  }

  const toggleItem = (item: Item) => toggleItems([item])
  const toggleRow = (row: Row) => toggleItems(config.itemsOf(row))
  const toggleAll = () => toggleItems(allItems.value)

  const handleScan = async () => {
    if (loading.value) return
    if (!selectedTargets.value.length) {
      message.warning('请至少选择一个网盘')
      return
    }
    reset()
    loading.value = true
    try {
      result.value = await config.scan(selectedTargets.value, rows)
      if (!rows.value.length) message.success(config.texts.scanEmpty)
      else if (config.texts.scanFound) message.success(config.texts.scanFound(rows.value.length))
    } catch (error: any) {
      message.error(error?.message || config.texts.scanFailed)
    } finally {
      loading.value = false
    }
  }

  const handleDelete = async () => {
    if (deleting.value) return
    const items = selectedItems.value
    if (!items.length) {
      message.warning(config.texts.deleteNone)
      return
    }
    if (!window.confirm(config.texts.deleteConfirm(items.length))) return
    deleting.value = true
    try {
      const data = await config.remove(items)
      result.value = data.report
      const deleted = new Set(data.deletedFileKeys)
      const withItems = config.withItems || ((row: Row) => row)
      const kept: Row[] = []
      for (const row of rows.value) {
        const keptItems = config.itemsOf(row).filter(item => !deleted.has(itemKey(item)))
        if (keptItems.length) kept.push(withItems(row, keptItems))
      }
      rows.value = kept
      selected.value = new Set(Array.from(selected.value).filter(key => !deleted.has(key)))
      if (data.failed) message.warning(config.texts.deletePartial)
      else message.success(config.texts.deleteDone)
    } catch (error: any) {
      message.error(error?.message || config.texts.deleteFailed)
    } finally {
      deleting.value = false
    }
  }

  onMounted(loadDriveOptions)
  watch(userStore.$state, async () => {
    reset()
    await loadDriveOptions()
  })

  return {
    driveOptions,
    selectedDriveKeys,
    selectedTargets,
    loading,
    deleting,
    result,
    rows,
    selected,
    selectedItems,
    isSelected,
    toggleItem,
    toggleRow,
    toggleAll,
    handleScan,
    handleDelete,
    reset,
    loadDriveOptions
  }
}
