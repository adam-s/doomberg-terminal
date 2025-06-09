import { Disposable } from 'vs/base/common/lifecycle';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IRequestService } from '../request.service';
import { InjectedScript } from '@injected/injectedScript';
import { waitForCondition } from '@shared/utils/utils';

export type ContractType = 'CALL' | 'PUT';

export interface SellOrder {
  quantity: number;
  link: string;
}

export interface Result {
  success: boolean;
  error?: string;
}

// Update interface to accept target option
export interface ISellTradingService {
  _serviceBrand: undefined;
  start: () => Promise<void>;
  completeSell: (quantity: number) => Promise<Result>;
}

export const ISellTradingService = createDecorator<ISellTradingService>('sellTradingService');

export class SellTradingService extends Disposable implements ISellTradingService {
  declare readonly _serviceBrand: undefined;

  private injectedScript: InjectedScript;

  constructor(@IRequestService private readonly requestService: IRequestService) {
    super();

    this._registerListeners();
    this.injectedScript = new InjectedScript(
      window,
      false,
      'javascript',
      'data-testid',
      3,
      'chromium',
      [],
    );
  }

  _registerListeners() {}

  async start() {}

  async completeSell(quantity: number): Promise<Result> {
    try {
      console.log('Starting sell process with quantity:', quantity);

      // 1. Find and click "Sell to Close" button
      console.log('Step 1: Looking for Sell to Close button...');
      const sellButtonSelector = this.injectedScript.parseSelector(
        'button:has-text("Sell to Close")',
      );
      const isSellButtonVisible = await waitForCondition(() => {
        const button = this.injectedScript.querySelector(
          sellButtonSelector,
          document.body,
          false,
        ) as HTMLButtonElement;
        return button && this.injectedScript.utils.isElementVisible(button);
      }, 10000);

      if (!isSellButtonVisible) {
        console.log('Error: Sell to Close button not found');
        return {
          success: false,
          error: 'Sell to Close button not found or not visible',
        };
      }
      console.log('Found Sell to Close button, clicking...');

      const sellButton = this.injectedScript.querySelector(
        sellButtonSelector,
        document.body,
        false,
      ) as HTMLButtonElement;
      sellButton.click();

      // 2. Wait for sell section to be active
      console.log('Step 2: Waiting for sell section to become active...');
      const sellSectionSelector = this.injectedScript.parseSelector(
        'div:has(> span > button:has-text("Sell to Close"))',
      );
      const isSellSectionActive = await waitForCondition(() => {
        const section = this.injectedScript.querySelector(
          sellSectionSelector,
          document.body,
          false,
        ) as HTMLElement;
        if (section) {
          const borderColor = getComputedStyle(section).borderColor;
          console.log('Current border color:', borderColor);
          return borderColor === 'rgb(255, 80, 0)' || borderColor === 'rgb(0, 200, 5)';
        }
        return false;
      }, 5000);

      if (!isSellSectionActive) {
        console.log('Error: Sell section did not become active');
        return { success: false, error: 'Sell section not active' };
      }
      console.log('Sell section is now active');

      // 3. Update quantity
      console.log('Step 3: Setting quantity to:', quantity);
      const quantityInputSelector = this.injectedScript.parseSelector(
        '#OptionOrderForm-Quantity-FormField',
      );
      const isQuantityInputVisible = await waitForCondition(() => {
        const input = this.injectedScript.querySelector(
          quantityInputSelector,
          document.body,
          false,
        ) as HTMLInputElement;
        return input && this.injectedScript.utils.isElementVisible(input);
      }, 5000);

      if (!isQuantityInputVisible) {
        console.log('Error: Quantity input not found');
        return {
          success: false,
          error: 'Quantity input not found or not visible',
        };
      }

      const quantityInput = this.injectedScript.querySelector(
        quantityInputSelector,
        document.body,
        false,
      ) as HTMLInputElement;
      quantityInput.value = quantity.toString();
      quantityInput.dispatchEvent(new Event('input', { bubbles: true }));
      console.log('Quantity set successfully');
      await new Promise(resolve => setTimeout(resolve, 5000));
      // 4. Click "Review Order" button
      console.log('Step 4: Looking for Review Order button...');
      const reviewButtonSelector = this.injectedScript.parseSelector(
        'button:has-text("Review Order")',
      );
      const isReviewButtonVisible = await waitForCondition(() => {
        const button = this.injectedScript.querySelector(
          reviewButtonSelector,
          document.body,
          false,
        ) as HTMLButtonElement;
        return button && this.injectedScript.utils.isElementVisible(button);
      }, 5000);

      if (!isReviewButtonVisible) {
        console.log('Error: Review Order button not found');
        return {
          success: false,
          error: 'Review Order button not found or not visible',
        };
      }

      const reviewButton = this.injectedScript.querySelector(
        reviewButtonSelector,
        document.body,
        false,
      ) as HTMLButtonElement;
      reviewButton.click();
      console.log('Clicked Review Order button');

      // 5. Wait for confirmation text
      console.log('Step 5: Waiting for confirmation text...');
      const confirmationSelector = this.injectedScript.parseSelector(
        'div[style="display: flow-root;"]:has-text("selling your right to")',
      );

      const isConfirmationVisible = await waitForCondition(() => {
        const confirmationDiv = this.injectedScript.querySelector(
          confirmationSelector,
          document.body,
          false,
        ) as HTMLElement;

        return confirmationDiv && this.injectedScript.utils.isElementVisible(confirmationDiv);
      }, 5000);

      if (!isConfirmationVisible) {
        console.log('Error: Confirmation text not found');
        return {
          success: false,
          error: 'Confirmation text not found or not visible',
        };
      }
      console.log('Confirmation text found');

      // 6. Click "Submit" button
      console.log('Step 6: Looking for Submit button...');
      const submitButtonSelector = this.injectedScript.parseSelector('button:has-text("Submit")');
      const isSubmitButtonVisible = await waitForCondition(() => {
        const button = this.injectedScript.querySelector(
          submitButtonSelector,
          document.body,
          false,
        ) as HTMLButtonElement;
        return button && this.injectedScript.utils.isElementVisible(button);
      }, 5000);

      if (!isSubmitButtonVisible) {
        console.log('Error: Submit button not found');
        return {
          success: false,
          error: 'Submit button not found or not visible',
        };
      }

      const submitButton = this.injectedScript.querySelector(
        submitButtonSelector,
        document.body,
        false,
      ) as HTMLButtonElement;
      submitButton.click();
      console.log('Clicked Submit button, sell process complete');

      return { success: true };
    } catch (error) {
      console.error('Unexpected error during sell process:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }
}
