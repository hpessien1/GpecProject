import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { logInAsAdmin, mockApi } from './support/sampleApi'
import type { ApiState } from './support/sampleApi'

// The pages GPEC's staff edit in the admin panel (Site content): the refunds policy (#refunds), the
// privacy notice (#privacy), and the FAQ on the home page (#faq). Their text comes from the API.

const lastSaved = (api: ApiState) => [...api.requests].reverse().find((r) => r.method === 'PATCH' && r.path.startsWith('/api/admin/content/'))

async function openEditor(page: Page, title: string) {
  await logInAsAdmin(page)
  await page.getByRole('navigation', { name: 'Admin sections' }).getByRole('link', { name: 'Site content' }).click()
  await page.getByRole('link', { name: `Edit ${title}` }).click()
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
}

test.describe('refunds policy page', () => {
  test('is linked from the footer and shows the saved text, marked as a draft', async ({ page }) => {
    await mockApi(page)
    await page.goto('/')
    await page.getByRole('contentinfo').getByRole('link', { name: 'Refunds & returns' }).click()
    await expect(page).toHaveTitle('Refunds, cancellations, and returns | GPEC')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Refunds, cancellations, and returns')
    await expect(page.getByRole('note')).toHaveText('Draft for GPEC’s review: not yet in effect. Highlighted items are still to be confirmed.')
    await expect(page.locator('.policy-updated time')).toHaveText('24 Oct 2026')
    await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Cancelling an order', 'Faulty items', 'How refunds are paid'])
    // [7] is highlighted as still to be confirmed, without its brackets.
    await expect(page.locator('mark.placeholder-text')).toHaveText('7')
    // "- " lines become a list, and a single line break stays a line break.
    await expect(page.locator('.policy-section').nth(2).getByRole('listitem')).toHaveText(['Paystack: back to the card you paid with.', 'Bank transfer: to your account.'])
    await expect(page.locator('.policy-section').first().locator('p br')).toHaveCount(1)
  })

  test('shows no draft notice once the wording is approved', async ({ page }) => {
    const api = await mockApi(page)
    api.siteContent.refunds.approved = true
    await page.goto('/#refunds')
    await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible()
    await expect(page.getByRole('note')).toHaveCount(0)
  })

  test('shows text staff typed as text, never as HTML', async ({ page }) => {
    const api = await mockApi(page)
    api.siteContent.refunds.sections = [{ heading: '<b>Bold?</b>', body: '<img src=x onerror="document.title=\'hacked\'"> [a <i>placeholder</i>]' }]
    await page.goto('/#refunds')
    await expect(page.getByRole('heading', { level: 2 })).toHaveText('<b>Bold?</b>')
    await expect(page.locator('.policy-section img, .policy-section b, .policy-section i')).toHaveCount(0)
    await expect(page.locator('.policy-section p')).toContainText('<img src=x')
    await expect(page).not.toHaveTitle('hacked')
  })

  test('says so when the page cannot be loaded', async ({ page }) => {
    await mockApi(page, { contentFails: true })
    await page.goto('/#refunds')
    await expect(page.getByRole('alert')).toContainText('Something went wrong')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page unavailable')
  })
})

test.describe('FAQ on the home page', () => {
  test('lists the questions closed, opens each on its own, and is linked from the footer', async ({ page }) => {
    await mockApi(page)
    await page.goto('/#privacy')
    await page.getByRole('contentinfo').getByRole('link', { name: 'FAQ' }).click()
    const faq = page.locator('#faq')
    await expect(faq).toBeInViewport()
    await expect(faq.getByRole('heading', { level: 2 })).toHaveText('Frequently asked questions')
    await expect(faq.getByRole('note')).toContainText('Draft for GPEC’s review')
    const questions = faq.locator('summary')
    await expect(questions).toHaveText(['How can I pay?', 'Where can I collect my order?', 'Do you deliver?'])
    await expect(faq.getByText('By bank transfer.')).toBeHidden()
    await questions.first().click()
    await expect(faq.getByRole('listitem')).toHaveText(['Online through Paystack.', 'By bank transfer.'])
    await expect(faq.getByText('Yes, to the delivery areas listed at checkout.')).toBeHidden()
    // From the keyboard too.
    await questions.nth(1).focus()
    await page.keyboard.press('Enter')
    await expect(faq.locator('mark.placeholder-text')).toHaveText('Collection hours, to be confirmed by GPEC.')
  })

  test('a load failure shows a message in the FAQ, and the rest of the page still works', async ({ page }) => {
    await mockApi(page, { contentFails: true })
    await page.goto('/#faq')
    await expect(page.locator('#faq').getByRole('alert')).toContainText('Something went wrong')
    await expect(page.locator('.quote-form')).toBeVisible()
  })
})

test.describe('site content in the admin panel', () => {
  test('lists the three pages with whether each is approved', async ({ page }) => {
    const api = await mockApi(page)
    api.siteContent.privacy.approved = true
    await logInAsAdmin(page)
    await page.getByRole('link', { name: 'Site content' }).click()
    const rows = page.locator('.admin-content-list li')
    await expect(rows).toHaveCount(3)
    await expect(rows.locator('.admin-status')).toHaveText(['Approved', 'Draft', 'Draft'])
    await expect(page.getByRole('link', { name: /^Edit / })).toHaveText([/Edit/, /Edit/, /Edit/])
  })

  test('edits, adds, moves, and removes questions, approves the FAQ, and the website shows it', async ({ page }) => {
    const api = await mockApi(page)
    await openEditor(page, 'Frequently asked questions')
    await expect(page.getByRole('group', { name: /^Question \d$/ })).toHaveCount(3)

    await page.getByRole('group', { name: 'Question 1' }).getByLabel('Answer').fill('Online through Paystack, or by bank transfer.')
    await page.getByRole('button', { name: 'Add a question' }).click()
    // The new question's first field takes focus, ready to type.
    await expect(page.getByRole('group', { name: 'Question 4' }).getByLabel('Question', { exact: true })).toBeFocused()
    await page.keyboard.type('Do you install?')
    await page.getByRole('group', { name: 'Question 4' }).getByLabel('Answer').fill('Yes. Ask for a quote.')
    await page.getByRole('button', { name: 'Move up: question 4' }).click()
    // Focus follows the moved question.
    await expect(page.getByRole('button', { name: 'Move up: question 3' })).toBeFocused()
    await page.getByRole('button', { name: 'Remove question 2' }).click()
    await expect(page.getByRole('group', { name: 'Question 2' }).getByLabel('Question', { exact: true })).toBeFocused()
    await page.getByRole('checkbox', { name: /Approved by GPEC/ }).check()
    await expect(page.getByText('You have changes that are not saved yet.')).toBeVisible()
    await page.getByRole('button', { name: 'Save and publish' }).click()

    await expect(page.getByRole('status').filter({ hasText: 'Saved. The website now shows this version.' })).toBeVisible()
    // Only what changed is sent: the whole list of questions in its new order, and the approval.
    expect(lastSaved(api)?.body).toEqual({
      approved: true,
      sections: [
        { heading: 'How can I pay?', body: 'Online through Paystack, or by bank transfer.' },
        { heading: 'Do you install?', body: 'Yes. Ask for a quote.' },
        { heading: 'Do you deliver?', body: 'Yes, to the delivery areas listed at checkout.' },
      ],
    })
    const history = page.locator('.admin-history')
    await expect(history.locator('ul > li').filter({ hasText: 'Question added' })).toContainText('Do you install?')
    await expect(history.locator('ul > li').filter({ hasText: 'Question removed' })).toContainText('Where can I collect my order?')
    await expect(history.locator('ul > li').filter({ hasText: 'Text changed' })).toContainText('How can I pay?')
    await expect(history.getByText('Approved: No → Yes')).toBeVisible()
    await history.getByText('Show the text before and after').click()
    await expect(history.getByText('Before: - Online through Paystack.')).toBeVisible()

    await page.goto('/#faq')
    await expect(page.locator('#faq summary')).toHaveText(['How can I pay?', 'Do you install?', 'Do you deliver?'])
    await expect(page.locator('#faq').getByRole('note')).toHaveCount(0)
  })

  test('keeps keyboard focus when a question moves to the top or bottom, where its button is disabled', async ({ page }) => {
    await mockApi(page)
    await openEditor(page, 'Frequently asked questions')
    await page.getByRole('button', { name: 'Move up: question 2' }).click()
    await expect(page.getByRole('button', { name: 'Move up: question 1' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Move down: question 1' })).toBeFocused()
    await page.getByRole('button', { name: 'Move down: question 2' }).click()
    await expect(page.getByRole('button', { name: 'Move up: question 3' })).toBeFocused()
    const questions = page.getByLabel('Question', { exact: true })
    await expect(questions.nth(0)).toHaveValue('Where can I collect my order?')
    await expect(questions.nth(1)).toHaveValue('Do you deliver?')
    await expect(questions.nth(2)).toHaveValue('How can I pay?')
  })

  test('sends nothing when nothing changed, and "Discard changes" puts the saved text back', async ({ page }) => {
    const api = await mockApi(page)
    await openEditor(page, 'Refunds, cancellations, and returns')
    await page.getByRole('button', { name: 'Save and publish' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'No changes to save.' })).toBeVisible()
    expect(lastSaved(api)).toBeUndefined()

    await page.getByLabel('Page title').fill('Returns')
    await page.getByRole('button', { name: 'Remove section 1' }).click()
    await page.getByRole('button', { name: 'Discard changes' }).click()
    await expect(page.getByLabel('Page title')).toHaveValue('Refunds, cancellations, and returns')
    await expect(page.getByRole('group', { name: /^Section \d$/ })).toHaveCount(3)
    await expect(page.getByRole('button', { name: 'Discard changes' })).toHaveCount(0)
  })

  test('will not save a question without its answer', async ({ page }) => {
    const api = await mockApi(page)
    await openEditor(page, 'Frequently asked questions')
    await page.getByRole('button', { name: 'Add a question' }).click()
    await page.keyboard.type('A question with no answer yet')
    await page.getByRole('button', { name: 'Save and publish' }).click()
    await expect(page.getByRole('group', { name: 'Question 4' }).getByLabel('Answer')).toBeFocused()
    expect(lastSaved(api)).toBeUndefined()
  })

  test('the privacy notice is edited the same way', async ({ page }) => {
    const api = await mockApi(page)
    await openEditor(page, 'Privacy notice')
    await page.getByLabel('Introduction').fill('What we collect, and why.')
    await page.getByRole('button', { name: 'Save and publish' }).click()
    await expect(page.locator('.admin-history').getByText('Introduction: What this website collects and why. → What we collect, and why.')).toBeVisible()
    expect(lastSaved(api)?.body).toEqual({ intro: 'What we collect, and why.' })
    await page.goto('/#privacy')
    await expect(page.locator('.policy-hero p:not(.eyebrow)')).toHaveText('What we collect, and why.')
  })
})
