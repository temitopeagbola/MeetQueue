import { expect, test } from '@playwright/test';

test('demo host → public booking → manage link → cancel', async ({ page }, testInfo) => {
  // 1. One-click demo sign-in lands on a dashboard with seeded bookings.
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the demo' }).first().click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Bookings' })).toBeVisible();
  await expect(page.getByText('Demo account.')).toBeVisible();

  // 2. An invitee opens the public page and picks the first available slot.
  await page.goto('/demo');
  await page.getByRole('link', { name: /Project consultation/ }).click();
  const times = page.getByRole('list', { name: 'Available times' });
  await expect(times.getByRole('button').first()).toBeVisible();
  await times.getByRole('button').first().click();

  const email = `e2e-${testInfo.project.name}-${Date.now()}@example.com`;
  await page.getByLabel('Name').fill('E2E Invitee');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Confirm booking' }).click();

  await expect(page.getByRole('heading', { name: 'You’re booked!' })).toBeVisible();
  await expect(page.getByText(`was sent to ${email}`)).toBeVisible();
  const manageHref = await page
    .getByRole('link', { name: 'Reschedule or cancel' })
    .getAttribute('href');
  expect(manageHref).toMatch(/^\/manage\/[\w-]{40,}$/);

  // 3. The host sees it on the dashboard, synced to the (mock) calendar.
  await page.goto('/dashboard');
  const card = page.getByRole('listitem').filter({ hasText: email });
  await expect(card).toBeVisible();
  await expect(card.getByText('Mock calendar')).toBeVisible();

  // 4. The invitee cancels through the private manage link; the slot is released.
  await page.goto(manageHref!);
  await expect(page.getByText('Confirmed', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel booking' }).click();
  const dialog = page.getByRole('dialog', { name: 'Cancel this booking?' });
  await dialog.getByLabel('Reason (optional)').fill('E2E smoke test cleanup');
  await dialog.getByRole('button', { name: 'Cancel booking' }).click();
  await expect(page.getByText('Your booking has been cancelled')).toBeVisible();
  await expect(page.getByText('Cancelled', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Book a new time' })).toBeVisible();
});
