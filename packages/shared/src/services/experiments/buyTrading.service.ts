import { Disposable } from 'vs/base/common/lifecycle';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IRequestService } from '../request.service';
import { InjectedScript } from '@injected/injectedScript';
import { waitForCondition } from '@shared/utils/utils';
// working
export type ContractType = 'CALL' | 'PUT';

export interface Order {
  quantity: number;
  stock: string;
  contractType: ContractType;
}

export interface ContractTypeResult {
  success: boolean;
  contractType: ContractType;
  error?: string;
  changed: boolean;
}

export interface ScrollOptionResult {
  success: boolean;
  error?: string;
}

export interface CompletePurchaseResult {
  success: boolean;
  message: string;
  error?: string;
}

// Update interface to accept target option
export interface IBuyTradingService {
  _serviceBrand: undefined;
  start: () => Promise<void>;
  waitForOptionsGrid: (timeout?: number) => Promise<boolean>;
  ensureContractType: (contractType: ContractType) => Promise<ContractTypeResult>;
  waitForOptionType: (contractType: ContractType, timeout?: number) => Promise<void>;
  scrollOptionIntoView: (strikePrice: string) => Promise<ScrollOptionResult>;
  completePurchase: (quantity: number) => Promise<CompletePurchaseResult>;
}

export const IBuyTradingService = createDecorator<IBuyTradingService>('buyTradingService');

export class BuyTradingService extends Disposable implements IBuyTradingService {
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

  async waitForOptionsGrid(timeout: number = 30000): Promise<boolean> {
    const condition = () => {
      const element = document.querySelector('.ReactVirtualized__Grid.ReactVirtualized__List');
      return !!(element && this.injectedScript.utils.isElementVisible(element));
    };
    const result = await waitForCondition(condition, timeout);
    if (!result) {
      throw new Error(`Timeout after ${timeout}ms waiting for options grid`);
    }
    return result;
  }

  async ensureContractType(desiredType: ContractType): Promise<ContractTypeResult> {
    try {
      // First check current state using the h1 content
      const h1Element = document.querySelector('section[data-testid="ChartSection"] h1');
      if (!h1Element) {
        return {
          success: false,
          contractType: desiredType,
          error: 'Chart section header not found',
          changed: false,
        };
      }

      const currentText = h1Element.textContent || '';
      const isCurrentlyCall = currentText.includes('Call');
      const needsToClick =
        (desiredType === 'CALL' && !isCurrentlyCall) || (desiredType === 'PUT' && isCurrentlyCall);

      if (!needsToClick) {
        return {
          success: true,
          contractType: desiredType,
          changed: false,
        };
      }

      // Only if we need to change, find and click the button
      const container = this.injectedScript.querySelector(
        this.injectedScript.parseSelector('[data-testid="OptionChainOptionTypeControl"]'),
        document,
        false,
      ) as HTMLDivElement;

      if (!container) {
        return {
          success: false,
          contractType: desiredType,
          error: 'Option type control not found',
          changed: false,
        };
      }

      const buttons = container.querySelectorAll('button');
      const callButton = buttons[0] as HTMLButtonElement;
      const putButton = buttons[1] as HTMLButtonElement;

      if (!callButton || !putButton) {
        return {
          success: false,
          contractType: desiredType,
          error: 'Contract type buttons not found',
          changed: false,
        };
      }

      const buttonToClick = desiredType === 'CALL' ? callButton : putButton;
      buttonToClick.click();

      // Verify the change took effect
      try {
        await this.waitForOptionType(desiredType);
        return {
          success: true,
          contractType: desiredType,
          changed: true,
        };
      } catch (error) {
        return {
          success: false,
          contractType: desiredType,
          error: 'Failed to confirm contract type change',
          changed: false,
        };
      }
    } catch (error) {
      return {
        success: false,
        contractType: desiredType,
        error: error instanceof Error ? error.message : 'Unknown error',
        changed: false,
      };
    }
  }

  async waitForOptionType(contractType: ContractType, timeout?: number): Promise<void> {
    const selector = 'section[data-testid="ChartSection"] h1';
    const expectedText = contractType === 'CALL' ? 'Call' : 'Put';
    const condition = () => {
      const element = document.querySelector(selector);
      return !!(
        element &&
        this.injectedScript.utils.isElementVisible(element) &&
        element.textContent?.includes(expectedText)
      );
    };
    const isConditionMet = await waitForCondition(condition, timeout);
    if (!isConditionMet) {
      throw new Error(`Timeout waiting for option type ${contractType}`);
    }
  }

  async scrollOptionIntoView(strikePrice: string): Promise<ScrollOptionResult> {
    try {
      await this.waitForOptionsGrid();

      const formattedStrike = parseFloat(strikePrice).toFixed(2);
      const selector = `[data-testid="ChainTableRow-${formattedStrike}"]`;

      window.scroll(0, 0);
      await new Promise(resolve => setTimeout(resolve, 50));

      let attempts = 0;
      const maxAttempts = 200;

      while (attempts < maxAttempts) {
        const row = document.querySelector(selector) as HTMLElement;
        await new Promise(resolve => setTimeout(resolve, 0));

        if (row) {
          row.scrollIntoView({
            behavior: 'instant',
            block: 'center',
          });
          window.scrollBy(0, -100);

          const button = row.querySelector(
            '[data-testid="OptionChainSelectRowButton"]',
          ) as HTMLButtonElement;

          if (button && this.injectedScript.utils.isElementVisible(button)) {
            button.click();
            return { success: true };
          } else {
            throw new Error('Select button not found or not visible');
          }
        }

        // Scroll down to load more options
        window.scrollBy(0, 200);
        attempts++;
      }

      throw new Error('Could not find option within maximum attempts');
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async completePurchase(quantity: number = 1): Promise<CompletePurchaseResult> {
    try {
      const quantityInput = document.querySelector(
        'input#OptionOrderForm-Quantity-FormField',
      ) as HTMLInputElement;

      if (!quantityInput) {
        return { success: false, message: 'Quantity input field not found' };
      }

      quantityInput.value = quantity.toString();
      quantityInput.dispatchEvent(new Event('input', { bubbles: true }));

      await new Promise(resolve => setTimeout(resolve, 5000));

      const reviewSelector = this.injectedScript.parseSelector(
        'form[data-testid="OptionOrderFormCard"] button:has-text("Review Order")',
      );
      const reviewButton = this.injectedScript.querySelector(
        reviewSelector,
        document.body,
        false,
      ) as HTMLButtonElement;

      if (!reviewButton) {
        return { success: false, message: 'Submit button not found' };
      }

      reviewButton.click();

      const goBackSelector = this.injectedScript.parseSelector(
        'form[data-testid="OptionOrderFormCard"] button:has-text("Go Back")',
      );

      const isGoBackButtonVisible = await waitForCondition(() => {
        const button = this.injectedScript.querySelector(
          goBackSelector,
          document.body,
          false,
        ) as HTMLButtonElement;
        return button && this.injectedScript.utils.isElementVisible(button);
      });

      if (!isGoBackButtonVisible) {
        return {
          success: false,
          message: 'Go back button not found or not visible',
        };
      }

      const goBackButton = this.injectedScript.querySelector(
        goBackSelector,
        document.body,
        false,
      ) as HTMLButtonElement;

      await new Promise(resolve => setTimeout(resolve, 1000));
      goBackButton.click();

      return { success: true, message: 'Purchase completed successfully.' };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
