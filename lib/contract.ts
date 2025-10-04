// lib/contracts.ts
import { Abi } from "viem"

export const counterAddress = "0x8e3C3f718BCEe67c5FA569FFe0AEd89477665B73";
export const counterABI: Abi = [
    {
        "type": "function",
        "name": "increment",
        "inputs": [],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "number",
        "inputs": [],
        "outputs": [
            {
                "name": "",
                "type": "uint256",
                "internalType": "uint256"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "setNumber",
        "inputs": [
            {
                "name": "newNumber",
                "type": "uint256",
                "internalType": "uint256"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    }
];
