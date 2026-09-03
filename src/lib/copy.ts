/**
 * Копирование в буфер обмена.
 *
 * В окне без рамки браузерный `navigator.clipboard` запрещён — Electron
 * отвечает «write permission denied», и кнопка молча ничего не делает.
 * Поэтому сначала просим главный процесс, а на браузер откатываемся только
 * при отладке в вкладке.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (window.workar?.copy) return await window.workar.copy(text)
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
