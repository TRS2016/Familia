import { useRef } from 'react'
import { Check, Trash2, MapPin, GripVertical } from 'lucide-react'
import type { Grocery } from './useGroceries'
import { getCategoryEmoji, formatPrice } from './groceries.utils'
import styles from './GroceriesPage.module.css'

export function GroceryItem({
  item, shoppingMode, compact, onToggle, onDelete, onEdit,
  showHandle, isDragging, isDragOver, onDragStart,
}: {
  item: Grocery
  shoppingMode: boolean
  compact: boolean
  onToggle: () => void
  onDelete: () => void
  onEdit: () => void
  showHandle?: boolean
  isDragging?: boolean
  isDragOver?: boolean
  onDragStart?: (e: React.PointerEvent<HTMLButtonElement>) => void
}) {
  const isOptimistic = item.id.startsWith('optimistic-')

  // Swipe vers la droite pour cocher (mode shopping uniquement)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)

  function handleTouchStart(e: React.TouchEvent) {
    if (!shoppingMode || item.checked) return
    const t = e.touches[0]
    touchStartRef.current = { x: t.clientX, y: t.clientY }
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (!shoppingMode || !touchStartRef.current) return
    const t = e.changedTouches[0]
    const dx = t.clientX - touchStartRef.current.x
    const dy = t.clientY - touchStartRef.current.y
    touchStartRef.current = null
    if (dx > 60 && dx > Math.abs(dy) * 1.5) {
      navigator.vibrate?.(50)
      onToggle()
    }
  }

  const metaParts: string[] = []
  if (!shoppingMode && item.created_by_member)
    metaParts.push(`Ajouté par ${item.created_by_member.display_name}`)
  if (item.checked && item.checked_by_member)
    metaParts.push(`coché par ${item.checked_by_member.display_name}`)

  const categoryEmoji = getCategoryEmoji(item.category)

  return (
    <li
      className={[
        styles.item,
        shoppingMode ? styles.itemShopping : '',
        compact ? styles.itemCompact : '',
        item.checked ? styles.itemChecked : '',
        isOptimistic ? styles.itemOptimistic : '',
        isDragging ? styles.itemDragging : '',
        isDragOver ? styles.itemDragOver : '',
      ].join(' ')}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      data-grocery-id={item.id}
    >

      {showHandle && (
        <button
          className={styles.dragHandle}
          onPointerDown={onDragStart}
          aria-label="Réordonner"
          tabIndex={-1}
        >
          <GripVertical size={14} strokeWidth={2} />
        </button>
      )}

      <button
        className={[
          styles.checkbox,
          shoppingMode ? styles.checkboxShopping : '',
          item.checked ? styles.checkboxChecked : '',
        ].join(' ')}
        onClick={() => {
          if (!item.checked) navigator.vibrate?.(50)
          onToggle()
        }}
        disabled={isOptimistic}
        aria-label={item.checked ? `Décocher ${item.name}` : `Cocher ${item.name}`}
      >
        {item.checked && <Check size={shoppingMode ? 16 : 13} strokeWidth={3} color="#fff" />}
      </button>

      <div
        className={styles.itemBody}
        onClick={shoppingMode ? undefined : onEdit}
        style={shoppingMode ? undefined : { cursor: 'pointer' }}
      >
        <div className={styles.itemNameRow}>
          {item.quantity && (
            <span className={[styles.qtyBadge, item.checked ? styles.qtyBadgeChecked : ''].join(' ')}>
              {item.quantity}
            </span>
          )}
          {categoryEmoji && (
            <span className={styles.categoryEmoji} aria-hidden="true">{categoryEmoji}</span>
          )}
          <span className={[
            styles.itemName,
            shoppingMode ? styles.itemNameShopping : '',
            item.checked ? styles.itemNameChecked : '',
          ].join(' ')}>
            {item.name}
          </span>
        </div>

        {/* Méta — masquée en mode compact */}
        {!compact && (item.store || metaParts.length > 0) && (
          <div className={styles.itemMeta}>
            {item.store && (
              <span className={[styles.storeMeta, item.checked ? styles.storeMetaChecked : ''].join(' ')}>
                <MapPin size={9} strokeWidth={2.5} />
                {item.store}
              </span>
            )}
            {item.store && metaParts.length > 0 && <span> · </span>}
            {metaParts.join(' · ')}
          </div>
        )}
      </div>

      {item.price !== null && (
        <span className={[
          styles.priceBadge,
          shoppingMode ? styles.priceBadgeShopping : '',
          item.checked ? styles.priceBadgeChecked : '',
        ].join(' ')}>
          {formatPrice(item.price)}
        </span>
      )}

      {!shoppingMode && (
        <button
          className={styles.deleteBtn}
          onClick={onDelete}
          disabled={isOptimistic}
          aria-label={`Supprimer ${item.name}`}
        >
          <Trash2 size={15} strokeWidth={2} />
        </button>
      )}

    </li>
  )
}
