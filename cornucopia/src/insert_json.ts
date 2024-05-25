import fs from 'fs'
import { menuItem } from './types'


export async function writeToFile(menuItem: menuItem): Promise<void> {
  const jsonData = JSON.stringify(menuItem, null, 2);
  try {
    fs.appendFileSync('menuItems.json', jsonData + ',\n')
  } catch (error) {
    console.error('An error occurred while appending to menuItems.json:', error);
  }
}

export async function removeTrailingComma(): Promise<void> {
  const menuItemsFilePath = 'menuItems.json'
  try {
    if (fs.existsSync(menuItemsFilePath)) {
      let fileData = fs.readFileSync(menuItemsFilePath, 'utf8')
      fileData = fileData.replace(/,\s*([\]}])/g, '\n$1')
      fs.writeFileSync(menuItemsFilePath, fileData, { flag: 'w' })
    } else {
      console.log('menuItems.json file does not exist.')
    }
  } catch (error) {
    console.error('An error occurred while removing trailing comma:', error)
  }
}