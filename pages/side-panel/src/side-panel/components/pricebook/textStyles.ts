import { makeStyles } from '@fluentui/react-components';

export const useTextStyles = makeStyles({
  labelText: {
    fontSize: '8px',
    letterSpacing: '0.8px',
    textTransform: 'uppercase',
    color: '#777',
    marginBottom: '3px',
  },
  symbolText: {
    fontSize: '16px',
    fontWeight: 'bold',
    padding: '8px',
    color: '#777',
  },
  valueText: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#777',
  },
});
