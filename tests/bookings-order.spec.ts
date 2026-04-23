import { test, expect, Page } from '@playwright/test';

/**
 * Сценарий тестирования: Проверка корректного порядка бронирований в админ-календаре
 * 
 * Тестирует исправление timezone issue: бронирования должны отображаться
 * на правильной дате независимо от часового пояса.
 * 
 * Предусловия:
 * - Приложение запущено и доступно
 * - В системе создан тип события
 */

test.describe('Проверка корректного порядка бронирований', () => {
  const eventTypeName = 'Тест timezone';
  const eventTypeDescription = 'Тест timezone бронирований';
  const eventTypeDuration = 30;

  test.beforeEach(async ({ page }) => {
    await createEventType(page, {
      name: eventTypeName,
      description: eventTypeDescription,
      durationMinutes: eventTypeDuration,
      color: '#2196f3'
    });
  });

  test('бронирование должно отображаться на правильной дате в админ-календаре', async ({ page }) => {
    // Шаг 1: Создаем бронирование на завтрашний день
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);
    
    await createBooking(page, {
      eventTypeName: eventTypeName,
      targetDate: tomorrow,
      guestName: 'Тестовый пользователь',
      guestEmail: 'test@example.com'
    });

    // Шаг 2: Переходим в админ-календарь
    await page.goto('/admin/calendar');
    await page.waitForLoadState('networkidle');
    
    // Ожидаем результат: Заголовок календаря отображается
    await expect(page.getByText('Календарь бронирований')).toBeVisible();

    // Шаг 3: Выбираем завтрашний день в календаре
    const targetDay = tomorrow.getDate();
    const dayCell = page.locator('.day-cell').filter({ hasText: targetDay.toString() }).first();
    await dayCell.click();
    await page.waitForTimeout(500);

    // Ожидаемый результат: Бронирование отображается на выбранный день
    const bookingCard = page.locator('.booking-card').filter({ hasText: 'Тестовый пользователь' });
    await expect(bookingCard).toBeVisible();
  });

  test('несколько бронирований на один день отображаются в хронологическом порядке', async ({ page }) => {
    // Шаг 1: Создаем первое бронирование на послезавтра
    const dayAfterTomorrow = new Date();
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);
    dayAfterTomorrow.setHours(9, 0, 0, 0);
    
    await createBooking(page, {
      eventTypeName: eventTypeName,
      targetDate: dayAfterTomorrow,
      guestName: 'Первый',
      guestEmail: 'first@example.com'
    });

    // Шаг 2: Создаем второе бронирование на тот же день, но позже
    const secondBooking = new Date(dayAfterTomorrow);
    secondBooking.setHours(14, 0, 0, 0);
    
    await createBooking(page, {
      eventTypeName: eventTypeName,
      targetDate: secondBooking,
      guestName: 'Второй',
      guestEmail: 'second@example.com'
    });

    // Шаг 3: Создаем третье бронирование на тот же день, вечером
    const thirdBooking = new Date(dayAfterTomorrow);
    thirdBooking.setHours(18, 30, 0, 0);
    
    await createBooking(page, {
      eventTypeName: eventTypeName,
      targetDate: thirdBooking,
      guestName: 'Третий',
      guestEmail: 'third@example.com'
    });

    // Шаг 4: Переходим в админ-календарь
    await page.goto('/admin/calendar');
    await page.waitForLoadState('networkidle');

    // Шаг 5: Выбираем день AfterTomorrow
    const targetDay = dayAfterTomorrow.getDate();
    const dayCell = page.locator('.day-cell').filter({ hasText: targetDay.toString() }).first();
    await dayCell.click();
    await page.waitForTimeout(500);

    // Ожидаемый результат: Все три бронирования отображаются
    await expect(page.locator('.booking-card').filter({ hasText: 'Первый' })).toBeVisible();
    await expect(page.locator('.booking-card').filter({ hasText: 'Второй' })).toBeVisible();
    await expect(page.locator('.booking-card').filter({ hasText: 'Третий' })).toBeVisible();

    // Ожидаемый результат: Бронирования отображаются в хронологическом порядке (09:00, 14:00, 18:30)
    const bookingCards = page.locator('.booking-card').all();
    const bookingsText = await Promise.all(bookingCards.map(card => card.textContent()));
    
    const firstIndex = bookingsText.findIndex(t => t?.includes('Первый'));
    const secondIndex = bookingsText.findIndex(t => t?.includes('Второй'));
    const thirdIndex = bookingsText.findIndex(t => t?.includes('Третий'));
    
    expect(firstIndex).toBeLessThan(secondIndex);
    expect(secondIndex).toBeLessThan(thirdIndex);
  });

  test('бронирование на вечернее время отображается на правильную дату', async ({ page }) => {
    // Создаем бронирование на вечер (проверка timezone edge case)
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 1);
    targetDate.setHours(23, 0, 0, 0);
    
    await createBooking(page, {
      eventTypeName: eventTypeName,
      targetDate: targetDate,
      guestName: 'Вечерний гость',
      guestEmail: 'evening@example.com'
    });

    // Переходим в админ-календарь
    await page.goto('/admin/calendar');
    await page.waitForLoadState('networkidle');

    // Выбираем дату бронирования
    const targetDay = targetDate.getDate();
    const dayCell = page.locator('.day-cell').filter({ hasText: targetDay.toString() }).first();
    await dayCell.click();
    await page.waitForTimeout(500);

    // Ожидаемый результат: Бронирование отображается на выбранный день
    const bookingCard = page.locator('.booking-card').filter({ hasText: 'Вечерний гость' });
    await expect(bookingCard).toBeVisible();
  });
});

async function createEventType(
  page: Page, 
  eventType: { name: string; description: string; durationMinutes: number; color: string }
): Promise<void> {
  await page.goto('/admin/event-types');
  await page.waitForLoadState('networkidle');
  
  const existingCard = page.locator('mat-card').filter({ hasText: eventType.name });
  if (await existingCard.isVisible().catch(() => false)) {
    return;
  }
  
  await page.getByRole('button', { name: /Создать тип/i }).click();
  await page.getByLabel('Название').fill(eventType.name);
  await page.getByLabel('Описание').fill(eventType.description);
  await page.getByLabel('Длительность (минуты)').fill(eventType.durationMinutes.toString());
  
  const colorInput = page.locator('input[type="color"]');
  await colorInput.fill(eventType.color);
  
  await page.getByRole('button', { name: /Сохранить/i }).click();
  await page.waitForSelector('mat-dialog-container', { state: 'hidden' });
}

async function createBooking(
  page: Page, 
  booking: { eventTypeName: string; targetDate: Date; guestName: string; guestEmail: string }
): Promise<void> {
  // Переходим на страницу бронирования
  await page.goto('/book');
  await page.waitForLoadState('networkidle');
  
  // Выбираем тип события
  await page.locator('mat-card').filter({ hasText: booking.eventTypeName }).click();
  await page.waitForTimeout(500);
  
  // Выбираем дату
  const targetDay = booking.targetDate.getDate();
  const dayCell = page.locator('.day-cell').filter({ hasText: targetDay.toString() }).first();
  await dayCell.click();
  await page.waitForTimeout(800);
  
  // Выбираем слот, closest to the target time
  const targetHour = booking.targetDate.getHours();
  const slots = page.locator('mat-list-option').filter({ hasNot: page.locator('.slot-status') }).all();
  
  let selectedSlot = null;
  for (const slot of slots) {
    const slotText = await slot.locator('span[matListItemTitle]').textContent();
    if (slotText) {
      const slotHour = parseInt(slotText.split(':')[0], 10);
      if (slotHour === targetHour || (targetHour >= 20 && slotHour >= 20)) {
        selectedSlot = slot;
        break;
      }
    }
  }
  
  if (!selectedSlot) {
    selectedSlot = await page.locator('mat-list-option').filter({ hasNot: page.locator('.slot-status') }).first();
  }
  
  await selectedSlot.click();
  await page.waitForTimeout(300);
  
  // Переходим к подтверждению
  await page.getByRole('button', { name: /Продолжить/i }).click();
  await expect(page.getByText('Подтверждение')).toBeVisible();
  
  // Заполняем контактные данные
  await page.getByLabel('Указать контактные данные').check();
  await page.getByLabel('Имя').fill(booking.guestName);
  await page.getByLabel('Email').fill(booking.guestEmail);
  
  // Бронируем
  await page.getByRole('button', { name: /Забронировать/i }).click();
  
  // Ждем успешного создания
  await expect(page.getByText('Бронирование успешно создано!')).toBeVisible({ timeout: 10000 });
  await page.waitForTimeout(500);
}
