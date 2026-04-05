import { ref } from 'vue'

const TAG_STYLES_KEY = 'tag_styles'

export type TagStyle = 'square' | 'portrait'

export function useTagStyles() {
  const tagStyles = ref<Record<string, TagStyle>>(
    JSON.parse(localStorage.getItem(TAG_STYLES_KEY) || '{}')
  )

  const setStyle = (tag: string, style: TagStyle) => {
    tagStyles.value[tag] = style
    localStorage.setItem(TAG_STYLES_KEY, JSON.stringify(tagStyles.value))
  }

  const getStyle = (tag: string): TagStyle => {
    return tagStyles.value[tag] || 'portrait'
  }

  return {
    tagStyles,
    setStyle,
    getStyle
  }
}
